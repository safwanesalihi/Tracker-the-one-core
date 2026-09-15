import { getAppUser, type AppUser } from '@/lib/auth';
import { requestOrigin } from '@/lib/auth-settings';
import { batch, database, type Statement } from '@/lib/database';
import { env } from '@/lib/env';
import { fields, inviteFields, requestFields } from '@/lib/validation';
import { RecordItem, sampleRecords } from '@/lib/model';
import {
  canManageMembers, isStudioRole, isWorkspaceRole, roleLabels,
  type WorkspaceContext, type WorkspaceMember, type WorkspaceSummary,
} from '@/lib/workspace';
import {
  approve, dayIn, flow, lockApplies, memberView, portalView, publish, requestChanges, sendForValidation,
} from '@/lib/flow';
import { applySweep, insertRecord, loadRecords } from '@/lib/flow-server';
import { isOwnerEmail, provisionAccount } from '@/lib/password-auth';
import { mailConfigured, sendInvitation } from '@/lib/mail';

export const dynamic = 'force-dynamic';

class WorkspaceAccessError extends Error {}
class NoWorkspaceError extends Error {}

const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

async function identity(req?: Request) {
  return await getAppUser(req);
}

const workspaceIdFor = (owner: string) => `ws:${owner}`;

async function one<T>(text: string, params: unknown[] = []) {
  return (await database().query<T>(text, params))[0] ?? null;
}

type MembershipRow = { id: string; name: string; role: string; clientId: string | null };
const membershipSelect = 'SELECT w.id, w.name, wm.role, wm.client_id AS "clientId"';

async function ensureWorkspace(owner: string, name: string): Promise<WorkspaceContext> {
  const now = new Date().toISOString();
  const id = workspaceIdFor(owner);
  await batch(database(), [
    { text: 'INSERT INTO workspaces (id, name, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) ON CONFLICT (id) DO NOTHING', params: [id, name, owner, now] },
    { text: `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
             SELECT $1, $2, 'owner', $3 WHERE EXISTS (SELECT 1 FROM workspaces WHERE id = $1 AND created_by = $2)
             ON CONFLICT (workspace_id, user_id) DO NOTHING`, params: [id, owner, now] },
  ]);
  const workspace = await one<MembershipRow>(
    `${membershipSelect} FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id WHERE w.id = $1 AND wm.user_id = $2`,
    [id, owner],
  );
  if (!workspace || !isWorkspaceRole(workspace.role)) throw new WorkspaceAccessError();
  return { id: workspace.id, name: workspace.name, role: workspace.role, clientId: workspace.clientId };
}

const membershipOrder = 'ORDER BY CASE WHEN w.created_by = wm.user_id THEN 1 ELSE 0 END, wm.created_at ASC, w.id ASC';
// Only the owner ever holds a workspace of their own; a leftover one on any other account is never offered.
const hideOwnWorkspace = (user: AppUser) => !isOwnerEmail(user.email);
const membershipFilter = 'AND ($2::boolean IS NOT TRUE OR w.created_by <> wm.user_id)';

async function workspacesFor(user: AppUser): Promise<WorkspaceSummary[]> {
  const rows = await database().query<WorkspaceSummary>(
    `SELECT w.id, w.name, wm.role FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id WHERE wm.user_id = $1 ${membershipFilter} ${membershipOrder}`,
    [user.userId, hideOwnWorkspace(user)],
  );
  return rows.filter((w) => isWorkspaceRole(w.role));
}

async function workspaceFor(user: AppUser, requestedId?: string | null): Promise<WorkspaceContext> {
  // A member lands in the studio that invited them; only the owner gets a workspace created for them.
  const membership = await one<MembershipRow>(
    `${membershipSelect} FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = $1 AND ($3::text IS NULL OR w.id = $3) ${membershipFilter} ${membershipOrder} LIMIT 1`,
    [user.userId, hideOwnWorkspace(user), requestedId ?? null],
  );
  if ((membership && !isWorkspaceRole(membership.role)) || (!membership && requestedId)) {
    throw new WorkspaceAccessError();
  }
  if (!membership && !isOwnerEmail(user.email)) throw new NoWorkspaceError();
  const workspace: WorkspaceContext = membership
    ? { id: membership.id, name: membership.name, role: membership.role as WorkspaceContext['role'], clientId: membership.clientId }
    : await ensureWorkspace(user.userId, user.fullName || user.displayName);
  // Only trust profile details from authenticated identity, never a membership-edit request.
  await database().query(
    `UPDATE workspace_members SET name = $1, email = $2 WHERE workspace_id = $3 AND user_id = $4
     AND (name IS DISTINCT FROM $1 OR email IS DISTINCT FROM $2)`,
    [user.fullName || user.displayName, user.email, workspace.id, user.userId],
  );
  return workspace;
}

async function members(workspaceId: string, withState = false) {
  return database().query<WorkspaceMember>(
    `SELECT wm.user_id AS "userId", wm.role, wm.name, wm.email, wm.client_id AS "clientId", wm.created_at AS "createdAt", u.avatar${withState
      ? ', (u.must_change_password AND u.last_login_at IS NULL) AS "pending", u.last_login_at AS "lastLoginAt"' : ''}
     FROM workspace_members wm LEFT JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id = $1
     ORDER BY CASE WHEN wm.role = 'owner' THEN 0 WHEN wm.role = 'client' THEN 2 ELSE 1 END, wm.created_at ASC, wm.user_id ASC`,
    [workspaceId],
  );
}

/** Loads the workspace, applies any due clocks, and returns the fresh rows. */
async function all(workspaceId: string) {
  const rows = await loadRecords(workspaceId);
  const touched = await applySweep(workspaceId, rows);
  return touched ? loadRecords(workspaceId) : rows;
}

const canWrite = (role: WorkspaceContext['role']) => role !== 'viewer' && role !== 'client';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const identitiesOf = (user: AppUser) => [user.fullName ?? '', user.displayName, user.email];
// A member's reach: tasks assigned to them, or not assigned to anyone yet.
const isMine = (user: AppUser, task: RecordItem) =>
  !task.assignee?.trim() || (task.assigneeId ? task.assigneeId === user.userId : identitiesOf(user).some((v) => v.trim().toLowerCase() === task.assignee!.trim().toLowerCase()));

function visibleTo(workspace: WorkspaceContext, rows: RecordItem[], user: AppUser) {
  if (workspace.role === 'client') return portalView(rows, workspace.clientId!);
  if (workspace.role === 'creative') return memberView(rows, identitiesOf(user), user.userId);
  return rows;
}

async function payload(workspace: WorkspaceContext, user: AppUser, rows?: RecordItem[]) {
  rows ??= await all(workspace.id);
  const roster = workspace.role === 'client' ? [] : await members(workspace.id, canManageMembers(workspace.role));
  return {
    records: visibleTo(workspace, rows, user),
    user: { id: user.userId, name: user.fullName || user.displayName, email: user.email, avatar: user.avatar },
    workspace,
    // Members get the roster for display only: no e-mails but their own.
    members: canManageMembers(workspace.role) ? roster : roster.map((m) => ({ ...m, email: m.userId === user.userId ? m.email : null })),
    workspaces: await workspacesFor(user),
    today: dayIn(new Date()),
    mailConfigured: mailConfigured(),
  };
}

function clientContextValid(workspace: WorkspaceContext, rows: RecordItem[]) {
  if (workspace.role !== 'client') return true;
  return !!workspace.clientId && rows.some((r) => r.kind === 'client' && r.id === workspace.clientId && !r.archived);
}

export async function GET(req: Request) {
  try {
    const user = await identity(req);
    if (!user) return response({ error: 'Connectez-vous pour accéder à votre espace.' }, 401);
    if (user.mustChangePassword) return response({ error: 'Choisissez votre mot de passe pour continuer.', code: 'password-change-required' }, 403);
    const workspace = await workspaceFor(user, req?.headers.get('X-Workspace-Id'));
    const rows = await all(workspace.id);
    if (!clientContextValid(workspace, rows)) {
      return response({ error: 'Votre accès client n’est plus actif. Contactez le studio.' }, 403);
    }
    return response(await payload(workspace, user, rows));
  } catch (error) {
    if (error instanceof NoWorkspaceError) return response({ error: 'Aucun espace ne vous est attribué. Demandez une invitation au studio.', code: 'no-workspace' }, 403);
    if (error instanceof WorkspaceAccessError) return response({ error: 'Vous n’avez plus accès à cet espace.' }, 403);
    console.error('load records', error);
    return response({ error: 'Impossible de charger votre espace. Réessayez.' }, 503);
  }
}

export async function POST(req: Request) {
  try {
    const user = await identity(req);
    if (!user) return response({ error: 'Connexion requise.' }, 401);
    if (user.mustChangePassword) return response({ error: 'Choisissez votre mot de passe pour continuer.', code: 'password-change-required' }, 403);

    const origin = req.headers.get('origin');
    if (origin && origin !== requestOrigin(req)) {
      return response({ error: 'Origine non autorisée.' }, 403);
    }
    if (!req.headers.get('content-type')?.includes('application/json')) {
      return response({ error: 'Format invalide.' }, 415);
    }

    const raw = await req.text();
    if (raw.length > 25000) return response({ error: 'Le contenu est trop long.' }, 413);
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(raw);
    } catch {
      return response({ error: 'Requête invalide.' }, 400);
    }
    if (!isObject(parsedBody)) return response({ error: 'Requête invalide.' }, 400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- action dispatch reads loosely typed fields, each validated below
    const body = parsedBody as Record<string, any>;

    const db = database();
    const owner = user.userId;
    const workspace = await workspaceFor(user, req.headers.get('X-Workspace-Id'));
    const now = new Date().toISOString();
    const today = dayIn(new Date());
    const actor = user.fullName || user.displayName;
    const result = async (extra: Record<string, unknown> = {}) => response({ ...(await payload(workspace, user)), ...extra });

    const rowsNow = await all(workspace.id);
    if (!clientContextValid(workspace, rowsNow)) return response({ error: 'Votre accès client n’est plus actif. Contactez le studio.' }, 403);

    const parentArchived = (rows: RecordItem[], task: RecordItem) =>
      !!task.archived || !!rows.find((r) => r.id === task.clientId)?.archived || !!rows.find((r) => r.id === task.projectId)?.archived;

    const findTask = (rows: RecordItem[], id: unknown) => {
      const task = rows.find((r) => r.id === id && r.kind === 'task');
      if (!task || parentArchived(rows, task)) return null;
      if (workspace.role === 'client' && task.clientId !== workspace.clientId) return null;
      if (workspace.role === 'creative' && !isMine(user, task)) return null;
      return task;
    };

    const saveTask = async (before: RecordItem, after: RecordItem) => {
      const changed = await db.query(
        'UPDATE records SET data = $1::jsonb, revision = revision + 1 WHERE id = $2 AND workspace_id = $3 AND revision = $4 RETURNING id',
        [JSON.stringify(after), before.id, workspace.id, before.revision],
      );
      return changed.length > 0;
    };

    const insert = (record: RecordItem, ignoreConflict = false) => {
      const statement = insertRecord(record, record.kind === 'event' ? 'system' : owner, workspace.id, ignoreConflict);
      return db.query(statement.text, statement.params);
    };

    // ----- membership -----

    const studioName = workspace.name;
    const deliver = async (email: string, name: string, roleLabel: string, temporaryPassword: string, renewal: boolean) => {
      const mail = await sendInvitation({ to: email, name, temporaryPassword, studio: studioName, url: env.AUTH_URL ?? new URL(req.url).origin, roleLabel, renewal });
      // The temporary password is returned only when the studio has to pass it on by hand.
      return { email, sent: mail.sent, error: mail.error, temporaryPassword: mail.sent ? undefined : temporaryPassword };
    };

    if (body.action === 'invite-member') {
      if (!canManageMembers(workspace.role)) return response({ error: 'Seuls le propriétaire et les administrateurs peuvent inviter.' }, 403);
      const parsed = inviteFields.safeParse(body);
      if (!parsed.success) return response({ error: parsed.error.issues[0].message }, 400);
      const { email, role, name } = parsed.data;
      if (isOwnerEmail(email)) return response({ error: 'Cette adresse est celle du propriétaire.' }, 400);
      let clientId: string | null = null;
      if (role === 'client') {
        const client = rowsNow.find((r) => r.kind === 'client' && r.id === parsed.data.clientId && !r.archived);
        if (!client) return response({ error: 'Choisissez un client actif pour cet accès portail.' }, 400);
        clientId = client.id;
      }
      const duplicate = await one<{ userId: string }>(
        'SELECT user_id AS "userId" FROM workspace_members WHERE workspace_id = $1 AND lower(email) = $2', [workspace.id, email],
      );
      if (duplicate) return response({ error: 'Cette adresse est déjà membre de l’espace. Utilisez « Renvoyer l’invitation » pour un nouveau mot de passe temporaire.' }, 409);
      const account = await provisionAccount(db, email, name ?? '');
      await db.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role, name, email, client_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, client_id = EXCLUDED.client_id, name = COALESCE(EXCLUDED.name, workspace_members.name)`,
        [workspace.id, account.userId, role, name || null, email, clientId, now],
      );
      const invitation = await deliver(email, name ?? '', roleLabels[role], account.temporaryPassword, false);
      return response({ workspace, members: await members(workspace.id, true), invitation });
    }

    if (body.action === 'renew-invitation') {
      if (!canManageMembers(workspace.role)) return response({ error: 'Seuls le propriétaire et les administrateurs peuvent renvoyer une invitation.' }, 403);
      const target = await one<WorkspaceMember>('SELECT user_id AS "userId", role, name, email FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspace.id, body.userId]);
      if (!target || !target.email) return response({ error: 'Membre introuvable.' }, 404);
      if (target.role === 'owner' || target.userId === user.userId) return response({ error: 'Le propriétaire change son mot de passe depuis son compte.' }, 400);
      const account = await provisionAccount(db, target.email.toLowerCase(), target.name ?? '');
      const invitation = await deliver(target.email.toLowerCase(), target.name ?? '', roleLabels[target.role], account.temporaryPassword, true);
      return response({ workspace, members: await members(workspace.id, true), invitation });
    }

    if (body.action === 'set-member-role' || body.action === 'remove-member') {
      if (!canManageMembers(workspace.role)) {
        return response({ error: 'Seuls le propriétaire et les administrateurs peuvent gérer les membres.' }, 403);
      }
      if (typeof body.userId !== 'string' || !body.userId || body.userId !== body.userId.trim() || body.userId.length > 200) {
        return response({ error: 'Identifiant de membre invalide.' }, 400);
      }
      if (body.action === 'set-member-role' && (!isWorkspaceRole(body.role) || body.role === 'owner')) {
        return response({ error: 'Rôle invalide.' }, 400);
      }
      if (!isWorkspaceRole(body.expectedRole)) return response({ error: 'Actualisez la liste des membres avant de réessayer.' }, 400);
      let clientId: string | null = null;
      if (body.action === 'set-member-role' && body.role === 'client') {
        const client = rowsNow.find((r) => r.kind === 'client' && r.id === body.clientId && !r.archived);
        if (!client) return response({ error: 'Choisissez un client actif pour cet accès portail.' }, 400);
        clientId = client.id;
      }
      const existing = await one<Pick<WorkspaceMember, 'role'>>(
        'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspace.id, body.userId],
      );
      if (!existing) return response({ error: 'Membre introuvable.' }, 404);
      if (existing.role === 'owner') return response({ error: 'Le propriétaire ne peut pas être modifié ou retiré.' }, 400);
      if (body.userId === user.userId) return response({ error: 'Vous ne pouvez pas modifier votre propre accès.' }, 400);
      // Check both the target's current role and the actor's authority in the write itself.
      const condition = `workspace_id = $1 AND user_id = $2 AND role = $3 AND role != 'owner'
        AND EXISTS (SELECT 1 FROM workspace_members actor
                    WHERE actor.workspace_id = $1 AND actor.user_id = $4 AND actor.role IN ('owner','admin'))`;
      const values = [workspace.id, body.userId, body.expectedRole, user.userId];
      const changed = body.action === 'set-member-role'
        ? await db.query(`UPDATE workspace_members SET role = $5, client_id = $6 WHERE ${condition} RETURNING user_id`, [...values, body.role, clientId])
        : await db.query(`DELETE FROM workspace_members WHERE ${condition} RETURNING user_id`, values);
      if (!changed.length) return response({ error: 'Les accès ont changé. Actualisez la liste avant de réessayer.' }, 409);
      const refreshedWorkspace = await workspaceFor(user, workspace.id);
      return response({ workspace: refreshedWorkspace, members: await members(workspace.id, true) });
    }

    // ----- demo data -----

    if (body.action === 'demo') {
      if (workspace.role !== 'owner') return response({ error: 'Seul le propriétaire peut ajouter des clients.' }, 403);
      const marker = `${owner}:demo`;
      const demoRecords = sampleRecords().map((record) => ({
        ...record,
        id: `${owner}:${record.id}`,
        clientId: record.clientId ? `${owner}:${record.clientId}` : undefined,
        projectId: record.projectId ? `${owner}:${record.projectId}` : undefined,
      }));
      const statements: Statement[] = demoRecords.map((record) => ({
        text: `INSERT INTO records (id, owner, workspace_id, kind, data, revision)
               SELECT $1, $2, $3, $4, $5::jsonb, 1 WHERE NOT EXISTS (SELECT 1 FROM records WHERE id = $6 AND workspace_id = $3)
               ON CONFLICT (id) DO NOTHING`,
        params: [record.id, owner, workspace.id, record.kind, JSON.stringify(record), marker],
      }));
      statements.push({
        text: "INSERT INTO records (id, owner, workspace_id, kind, data, revision) VALUES ($1, $2, $3, 'meta', '{}'::jsonb, 1) ON CONFLICT (id) DO NOTHING",
        params: [marker, owner, workspace.id],
      });
      await batch(db, statements);
      return result();
    }

    // ----- the single channel -----

    if (body.action === 'comment') {
      if (workspace.role === 'viewer') return response({ error: 'Votre rôle est en lecture seule.' }, 403);
      const task = findTask(rowsNow, body.taskId);
      if (!task) return response({ error: 'Tâche introuvable.' }, 404);
      if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 5000) {
        return response({ error: 'Écrivez un commentaire de 1 à 5 000 caractères.' }, 400);
      }
      const comment: RecordItem = {
        id: crypto.randomUUID(), kind: 'comment', revision: 1, name: body.text.trim(), taskId: task.id,
        clientId: task.clientId, author: actor, createdAt: now,
        ...(workspace.role === 'client' ? { audience: 'client' as const } : {}),
      };
      await insert(comment);
      return result();
    }

    // ----- validation: explicit approval, request for changes, publication -----

    if (body.action === 'approve') {
      if (workspace.role === 'viewer') return response({ error: 'Votre rôle est en lecture seule.' }, 403);
      const task = findTask(rowsNow, body.taskId);
      if (!task) return response({ error: 'Livrable introuvable.' }, 404);
      if (task.status !== 'À valider') return response({ error: 'Ce livrable n’est pas en attente de validation.' }, 409);
      const mode = workspace.role === 'client' ? 'explicit' : 'studio';
      const after = approve(task, { mode, by: actor, email: user.email, at: now, round: task.revisionRound ?? 0 });
      if (!(await saveTask(task, after))) return response({ error: 'Ce livrable a changé. Actualisez avant de réessayer.' }, 409);
      await insert({ id: `evt:${task.id}:decision:${now}`, kind: 'event', revision: 1, type: 'decision', audience: 'studio',
        name: `« ${task.name} » validé par ${actor}${mode === 'studio' ? ' (depuis le studio)' : ''}.`, taskId: task.id, clientId: task.clientId, createdAt: now }, true);
      return result({ id: task.id });
    }

    if (body.action === 'request-changes') {
      if (workspace.role === 'viewer') return response({ error: 'Votre rôle est en lecture seule.' }, 403);
      const task = findTask(rowsNow, body.taskId);
      if (!task) return response({ error: 'Livrable introuvable.' }, 404);
      if (task.status !== 'À valider') return response({ error: 'Ce livrable n’est pas en attente de validation.' }, 409);
      if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 5000) {
        return response({ error: 'Précisez les modifications demandées (1 à 5 000 caractères).' }, 400);
      }
      const after = requestChanges(task, actor, now);
      const round = after.revisionRound!;
      const tag = round > flow.maxRevisionRounds ? `Retours client — tour ${round} · hors forfait` : `Retours client — tour ${round}`;
      if (!(await saveTask(task, after))) return response({ error: 'Ce livrable a changé. Actualisez avant de réessayer.' }, 409);
      await insert({ id: crypto.randomUUID(), kind: 'comment', revision: 1, name: `[${tag}] ${body.text.trim()}`, taskId: task.id,
        clientId: task.clientId, author: actor, createdAt: now, ...(workspace.role === 'client' ? { audience: 'client' as const } : {}) });
      await insert({ id: `evt:${task.id}:round:${round}:${now}`, kind: 'event', revision: 1, type: 'decision', audience: 'studio',
        name: `${tag} sur « ${task.name} » (${actor}).`, taskId: task.id, clientId: task.clientId, createdAt: now }, true);
      return result({ id: task.id });
    }

    if (body.action === 'publish') {
      if (!canWrite(workspace.role)) return response({ error: 'Votre rôle ne peut pas publier.' }, 403);
      const task = findTask(rowsNow, body.taskId);
      if (!task) return response({ error: 'Tâche introuvable.' }, 404);
      if (task.publishable === false) return response({ error: 'Cette tâche est un travail interne, elle ne se publie pas.' }, 409);
      if (task.status !== 'Validé') return response({ error: 'Un contenu se publie une fois validé.' }, 409);
      if (task.publishedAt) return response({ error: 'Déjà publié.' }, 409);
      const day = typeof body.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : null;
      const publishedAt = day ? new Date(`${day}T12:00:00.000Z`).toISOString() : now;
      const after = publish(task, publishedAt, actor);
      if (!(await saveTask(task, after))) return response({ error: 'Cette tâche a changé. Actualisez avant de réessayer.' }, 409);
      return result({ id: task.id });
    }

    // ----- request bank: the portal form -----

    if (body.action === 'request') {
      if (workspace.role === 'viewer' || workspace.role === 'creative') return response({ error: 'Seuls les administrateurs saisissent une demande au nom d’un client.' }, 403);
      const clientId = workspace.role === 'client' ? workspace.clientId : body.clientId;
      const client = rowsNow.find((r) => r.kind === 'client' && r.id === clientId && !r.archived);
      if (!client) return response({ error: 'Client introuvable.' }, 404);
      const parsed = requestFields.safeParse(body.data);
      if (!parsed.success) return response({ error: parsed.error.issues[0].message }, 400);
      const data = parsed.data;
      let project = rowsNow.find((r) => r.kind === 'project' && r.clientId === client.id && !r.archived && (!data.projectId || r.id === data.projectId));
      if (data.projectId && !project) return response({ error: 'Choisissez un sous-projet de ce client.' }, 400);
      const statements: Statement[] = [];
      if (!project) {
        project = { id: crypto.randomUUID(), kind: 'project', revision: 1, name: 'Demandes', clientId: client.id,
          description: 'Demandes reçues via le portail client.', createdAt: now };
        statements.push(insertRecord(project, owner, workspace.id));
      }
      const task: RecordItem = {
        id: crypto.randomUUID(), kind: 'task', revision: 1, name: data.name, clientId: client.id, projectId: project.id,
        description: data.description || '', due: data.due || '', channel: data.channel || '', status: 'À faire', source: 'Portail',
        request: { by: actor, email: user.email, at: now }, createdAt: now,
        history: [{ text: `Demande reçue via le portail (${actor})`, date: now }],
      };
      statements.push(insertRecord(task, owner, workspace.id));
      statements.push(insertRecord({ id: `evt:${task.id}:request`, kind: 'event', revision: 1, type: 'request', audience: 'studio',
        name: `Nouvelle demande de ${client.name} : « ${task.name} »${data.due ? ` pour le ${data.due}` : ''}.`, taskId: task.id, clientId: client.id, createdAt: now },
        'system', workspace.id, true));
      await batch(db, statements);
      return result({ id: task.id });
    }

    if (body.action === 'delete') {
      if (!canManageMembers(workspace.role)) return response({ error: 'Seuls le propriétaire et les administrateurs peuvent supprimer une tâche.' }, 403);
      const task = rowsNow.find((r) => r.id === body.id && r.kind === 'task');
      if (!task) return response({ error: 'Tâche introuvable.' }, 404);
      if (body.revision !== task.revision) return response({ error: 'Cette tâche a changé. Actualisez avant de réessayer.' }, 409);
      // The task and everything hanging off it: comments, events. Nothing else references a task.
      const deleted = await db.transaction(async (tx) => {
        const rows = await tx.query('DELETE FROM records WHERE workspace_id = $1 AND id = $2 AND revision = $3 RETURNING id', [workspace.id, task.id, task.revision]);
        if (!rows.length) return false;
        await tx.query("DELETE FROM records WHERE workspace_id = $1 AND kind IN ('comment', 'event') AND data->>'taskId' = $2", [workspace.id, task.id]);
        return true;
      });
      if (!deleted) return response({ error: 'Cette tâche a changé. Actualisez avant de réessayer.' }, 409);
      return result();
    }

    // ----- own profile: the display name used in greetings, comments and receipts -----

    if (body.action === 'update-profile') {
      // Name and/or picture. The picture is an uploaded 'avatar' asset id (null removes it); replaced pictures are dropped.
      const wantsName = body.name !== undefined, wantsAvatar = body.avatar !== undefined;
      const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
      if (wantsName && (name.length < 2 || name.length > 80)) return response({ error: 'Indiquez un nom (2 à 80 caractères).' }, 400);
      const avatar = body.avatar === null || body.avatar === '' ? null : typeof body.avatar === 'string' && /^[0-9a-f-]{36}$/.test(body.avatar) ? body.avatar : undefined;
      if (wantsAvatar && avatar === undefined) return response({ error: 'Image introuvable.' }, 400);
      if (!wantsName && !wantsAvatar) return response({ error: 'Requête invalide.' }, 400);
      const current = (await db.query<{ avatar: string | null }>('SELECT avatar FROM users WHERE id = $1', [user.userId]))[0];
      if (wantsAvatar && avatar) {
        const owned = (await db.query<{ id: string }>("SELECT id FROM assets WHERE id = $1 AND kind = 'avatar' AND created_by = $2", [avatar, user.userId]))[0];
        if (!owned) return response({ error: 'Image introuvable.' }, 400);
      }
      await db.transaction(async (tx) => {
        if (wantsName) {
          await tx.query(
            `UPDATE records r SET data = jsonb_set(jsonb_set(r.data, '{assigneeId}', to_jsonb($1::text)), '{assignee}', to_jsonb($2::text)), revision = revision + 1
             WHERE kind = 'task' AND (data->>'assigneeId' = $1 OR (
               data->>'assigneeId' IS NULL AND lower(trim(data->>'assignee')) = ANY($3::text[])
               AND EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = r.workspace_id AND wm.user_id = $1)
               AND NOT EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = r.workspace_id AND wm.user_id <> $1
                 AND lower(trim(data->>'assignee')) IN (lower(trim(wm.name)), lower(trim(wm.email))))))`,
            [user.userId, name, identitiesOf(user).map((v) => v.trim().toLowerCase()).filter(Boolean)],
          );
          await tx.query('UPDATE users SET name = $2 WHERE id = $1', [user.userId, name]);
          await tx.query('UPDATE workspace_members SET name = $2 WHERE user_id = $1', [user.userId, name]);
        }
        if (wantsAvatar) {
          await tx.query('UPDATE users SET avatar = $2 WHERE id = $1', [user.userId, avatar]);
          if (current?.avatar && current.avatar !== avatar) await tx.query('DELETE FROM assets WHERE id = $1', [current.avatar]);
        }
      });
      const fresh: AppUser = { ...user, fullName: wantsName ? name : user.fullName, displayName: wantsName ? name : user.displayName, avatar: wantsAvatar ? avatar! : current?.avatar ?? null };
      return response({ ...(await payload(workspace, fresh)), user: { id: fresh.userId, name: fresh.fullName || fresh.displayName, email: fresh.email, avatar: fresh.avatar } });
    }

    if (body.action === 'mark-read') {
      if (!isStudioRole(workspace.role)) return response({ error: 'Action réservée au studio.' }, 403);
      const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown): id is string => typeof id === 'string' && id.startsWith('evt:')).slice(0, 200) : [];
      const events = rowsNow.filter((r) => r.kind === 'event' && ids.includes(r.id) && !r.read);
      if (events.length) {
        await batch(db, events.map((event) => ({
          text: 'UPDATE records SET data = $1::jsonb WHERE id = $2 AND workspace_id = $3',
          params: [JSON.stringify({ ...event, read: true }), event.id, workspace.id],
        })));
      }
      return result();
    }

    // ----- create / update -----

    if (!['create', 'update'].includes(body.action) || !['client', 'project', 'task'].includes(body.kind)) {
      return response({ error: 'Action invalide.' }, 400);
    }
    if (!canWrite(workspace.role)) return response({ error: 'Votre rôle est en lecture seule.' }, 403);
    if (body.action === 'create' && body.kind === 'client' && workspace.role !== 'owner') {
      return response({ error: 'Seul le propriétaire peut ajouter des clients.' }, 403);
    }
    const rows = rowsNow;
    const existing =
      body.action === 'update'
        ? rows.find((record) => record.id === body.id && record.kind === body.kind)
        : undefined;
    if (body.action === 'update' && !existing) return response({ error: 'Élément introuvable.' }, 404);
    // A member edits only the tasks within their reach; tasks are created by owners and admins. Clients and sub-projects are shared work.
    if (workspace.role === 'creative' && body.kind === 'task' && !existing) return response({ error: 'Les tâches sont créées par le propriétaire ou un administrateur.' }, 403);
    if (workspace.role === 'creative' && existing?.kind === 'task' && !isMine(user, existing)) return response({ error: 'Élément introuvable.' }, 404);

    const parsed = fields.safeParse(body.data);
    if (!parsed.success) return response({ error: parsed.error.issues[0].message }, 400);
    const data = parsed.data;
    let assigneeId = existing?.assigneeId;
    if (body.kind === 'task' && !data.assignee) assigneeId = undefined;
    if (body.kind === 'task' && data.assignee) {
      const availableMembers = await members(workspace.id);
      const allowedAssignees = new Set(
        availableMembers.filter((m) => isStudioRole(m.role)).flatMap((member) => [member.name, member.email].filter((value): value is string => !!value)),
      );
      const matching = availableMembers.filter((m) => isStudioRole(m.role) && [m.name, m.email].includes(data.assignee!));
      if (data.assignee !== existing?.assignee || !assigneeId) {
        if (matching.length > 1) return response({ error: 'Choisissez une personne de l’équipe pour l’assignation.' }, 400);
        if (matching.length === 1) assigneeId = matching[0].userId;
      }
      const unchangedLegacyAssignee = body.action === 'update' && existing?.assignee === data.assignee;
      if (!allowedAssignees.has(data.assignee) && !unchangedLegacyAssignee) {
        return response({ error: 'Choisissez une personne de l’équipe pour l’assignation.' }, 400);
      }
    }
    if (workspace.role === 'creative' && !!data.archived !== !!existing?.archived) {
      return response({ error: 'Seuls les administrateurs peuvent archiver ou restaurer des éléments.' }, 403);
    }
    // A member's only edit on a task is the deliverable link; every other field is read-only for them.
    // Falsy values (undefined/null/false/'') are treated as equivalent so an unset field sent back
    // as its default (e.g. archived: false) is never mistaken for a change.
    if (workspace.role === 'creative' && body.kind === 'task' && existing) {
      const memberEditableFields = new Set(['deliverable']);
      const normalize = (value: unknown) => (value || null);
      const touchedFields = (Object.keys(data) as (keyof typeof data)[]).filter(
        (key) => normalize(data[key]) !== normalize((existing as Record<string, unknown>)[key]),
      );
      if (touchedFields.some((key) => !memberEditableFields.has(key as string))) {
        return response({ error: 'Un membre ne peut modifier que le lien livrable de cette tâche.' }, 403);
      }
    }
    if (existing?.archived && data.archived !== false) {
      return response({ error: 'Restaurez cet élément avant de le modifier.' }, 400);
    }
    if (existing?.demo && existing.deliverable === '/demo-deliverable.html' && !data.deliverable) {
      data.deliverable = existing.deliverable;
    }
    if (body.kind !== 'client') {
      const client = rows.find((record) => record.kind === 'client' && record.id === data.clientId);
      if (!client || (client.archived && !data.archived)) {
        return response({ error: 'Sélectionnez un client actif.' }, 400);
      }
    }
    let lockLifted = false;
    if (body.kind === 'task') {
      if (data.projectId) {
        const project = rows.find(
          (record) => record.kind === 'project' && record.id === data.projectId && record.clientId === data.clientId,
        );
        if (!project || (project.archived && !data.archived)) {
          return response({ error: 'Sélectionnez un sous-projet de ce client.' }, 400);
        }
      }
      data.status = data.status || 'À faire';
      // "À valider" is never picked manually: saving a new/changed deliverable link is what sends a task for validation.
      const previousStatus = existing?.status || 'À faire';
      if (data.status === previousStatus && existing?.status !== 'Validé' && data.deliverable && data.deliverable !== existing?.deliverable) {
        data.status = 'À valider';
      }
      if (workspace.role === 'creative' && data.status === 'Validé' && existing?.status !== 'Validé') {
        return response({ error: 'Seuls le client, le propriétaire ou un administrateur peuvent valider un livrable.' }, 403);
      }
      if (['À valider', 'Validé'].includes(data.status) && !data.deliverable) {
        return response({ error: 'Ajoutez un lien livrable avant la validation.' }, 400);
      }
      if (data.evergreen && data.due) {
        return response({ error: 'Un contenu de réserve n’a pas de date de publication. Retirez la date ou sortez-le de la réserve.' }, 400);
      }
      // J−7 lock: the calendar is frozen one week out. Admins may lift it explicitly; the lift is recorded.
      if (data.publishable !== false && lockApplies(existing?.due, data.due, today)) {
        if (!canManageMembers(workspace.role)) {
          return response({ error: `Verrou J−${flow.lockDays} : cette date est trop proche. Demandez à un administrateur de lever le verrou.`, code: 'lock' }, 403);
        }
        if (body.lockOverride !== true) {
          return response({ error: `Verrou J−${flow.lockDays} : cette date tombe dans la semaine gelée. Confirmez pour lever le verrou.`, code: 'lock' }, 409);
        }
        lockLifted = true;
      }
    }
    if (existing?.status === 'Validé' && data.deliverable !== existing.deliverable) data.status = 'En cours';

    let item = {
      ...existing,
      ...data,
      ...(body.kind === 'task' ? { assigneeId } : {}),
      id: existing?.id || crypto.randomUUID(),
      kind: body.kind,
      createdAt: existing?.createdAt || now,
    } as RecordItem;
    if (lockLifted) item.lockOverride = true;
    const statusChanged = data.status !== existing?.status;
    if (body.kind === 'task' && statusChanged) {
      if (data.status === 'À valider') item = sendForValidation({ ...item, status: existing?.status }, now);
      else if (data.status === 'Validé') item = approve({ ...item, status: existing?.status }, { mode: 'studio', by: actor, email: user.email, at: now, round: item.revisionRound ?? 0 });
      else {
        // Internal rejection or a step back: the clock stops and is not counted as a client round.
        item.approvalDueAt = undefined;
        if (existing?.status === 'Validé') { item.validatedAt = undefined; item.signOff = undefined; }
      }
    }
    const transitionLogged = body.kind === 'task' && statusChanged && (data.status === 'À valider' || data.status === 'Validé');
    if (!transitionLogged) {
      item.history = [
        ...(existing?.history || []),
        {
          text: !existing
            ? 'Élément créé'
            : data.archived && !existing.archived
              ? 'Élément archivé'
              : !data.archived && existing.archived
                ? 'Élément restauré'
                : data.status !== existing.status
                  ? `Statut : ${data.status}`
                  : 'Informations mises à jour',
          date: now,
        },
      ].slice(-100);
    }
    if (lockLifted) item.history = [...(item.history || []), { text: `Verrou J−${flow.lockDays} levé par ${actor} pour le ${data.due}`, date: now }].slice(-100);
    if (existing?.evergreen && data.due && !data.evergreen) {
      item.evergreen = false;
      item.history = [...(item.history || []), { text: `Sorti de la réserve · planifié le ${data.due}`, date: now }].slice(-100);
    }

    if (existing) {
      if (body.revision !== existing.revision) {
        return response({ error: 'Cet élément a changé. Actualisez avant de réessayer.' }, 409);
      }
      const changed = await db.query(
        'UPDATE records SET data = $1::jsonb, revision = revision + 1 WHERE id = $2 AND workspace_id = $3 AND revision = $4 RETURNING id',
        [JSON.stringify(item), existing.id, workspace.id, body.revision],
      );
      if (!changed.length) return response({ error: 'Modification simultanée. Actualisez votre espace.' }, 409);
      // Replaced or removed images are dropped right away; ids are never reused.
      const dropped = (['logo', 'banner'] as const).filter((k) => existing[k] && existing[k] !== item[k]).map((k) => existing[k]!);
      if (dropped.length) await db.query('DELETE FROM assets WHERE workspace_id = $1 AND id = ANY($2::text[])', [workspace.id, dropped]);
    } else {
      await insert(item);
    }
    // Studio-wide events for the polling alerts panel: a new client, or a task handed to someone.
    // IDs are prefixed evt: (like every other event) so mark-read recognizes and can clear them.
    if (body.kind === 'client' && !existing) {
      await insert({ id: `evt:${item.id}:client-added:${now}`, kind: 'event', revision: 1, type: 'client-added', audience: 'studio',
        name: `Nouveau client « ${item.name} » ajouté par ${actor}.`, clientId: item.id, createdAt: now }, true);
    }
    if (body.kind === 'task' && data.assignee && data.assignee !== existing?.assignee) {
      await insert({ id: `evt:${item.id}:task-assigned:${now}`, kind: 'event', revision: 1, type: 'task-assigned', audience: 'studio',
        name: `« ${item.name} » assignée à ${data.assignee} par ${actor}.`, taskId: item.id, clientId: item.clientId, createdAt: now }, true);
    }
    return result({ id: item.id });
  } catch (error) {
    if (error instanceof NoWorkspaceError) return response({ error: 'Aucun espace ne vous est attribué. Demandez une invitation au studio.', code: 'no-workspace' }, 403);
    if (error instanceof WorkspaceAccessError) return response({ error: 'Vous n’avez plus accès à cet espace.' }, 403);
    console.error('save record', error);
    return response({ error: 'Enregistrement impossible. Vos saisies sont conservées ; réessayez.' }, 503);
  }
}
