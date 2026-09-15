import { getAppUser, type AppUser } from '@/lib/auth';
import { requestOrigin } from '@/lib/auth-settings';
import { batch, database, type Statement } from '@/lib/database';
import { fields, inviteFields, requestFields } from '@/lib/validation';
import { RecordItem, sampleRecords } from '@/lib/model';
import {
  canManageMembers, inviteId, isStudioRole, isWorkspaceRole,
  type WorkspaceContext, type WorkspaceMember, type WorkspaceSummary,
} from '@/lib/workspace';
import {
  approve, dayIn, flow, lockApplies, memberView, portalView, publish, requestChanges, sendForValidation,
} from '@/lib/flow';
import { applySweep, insertRecord, loadRecords } from '@/lib/flow-server';
import { newInviteCode } from '@/lib/password-auth';
import { closedStudio, isOwnerEmail } from '@/lib/access';

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

/** A pending invitation (row keyed by e-mail) becomes a membership the first time that verified Google e-mail signs in. */
async function claimInvites(user: AppUser) {
  if (!user.verified) return; // password accounts claim with the invitation code at sign-in
  const pending = inviteId(user.email);
  // Only invitations whose code was entered at Google sign-in (invite_code cleared) are claimed by e-mail.
  const invites = await database().query<{ workspaceId: string }>(
    'SELECT workspace_id AS "workspaceId" FROM workspace_members WHERE user_id = $1 AND invite_code IS NULL', [pending],
  );
  if (!invites.length) return;
  const name = user.fullName || user.displayName;
  await batch(database(), invites.flatMap(({ workspaceId }): Statement[] => [
    { text: `UPDATE workspace_members SET user_id = $1, name = $2, email = $3, invite_code = NULL
             WHERE workspace_id = $4 AND user_id = $5
               AND NOT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = $4 AND user_id = $1)`,
      params: [user.userId, name, user.email, workspaceId, pending] },
    { text: 'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', params: [workspaceId, pending] },
  ]));
}

const membershipOrder = 'ORDER BY CASE WHEN w.created_by = wm.user_id THEN 1 ELSE 0 END, wm.created_at ASC, w.id ASC';
// In a closed studio, a member's own leftover workspace (from before the rule) is never offered.
const hideOwnWorkspace = (user: AppUser) => closedStudio() && !isOwnerEmail(user.email);
const membershipFilter = 'AND ($2::boolean IS NOT TRUE OR w.created_by <> wm.user_id)';

async function workspacesFor(user: AppUser): Promise<WorkspaceSummary[]> {
  const rows = await database().query<WorkspaceSummary>(
    `SELECT w.id, w.name, wm.role FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id WHERE wm.user_id = $1 ${membershipFilter} ${membershipOrder}`,
    [user.userId, hideOwnWorkspace(user)],
  );
  return rows.filter((w) => isWorkspaceRole(w.role));
}

async function workspaceFor(user: AppUser, requestedId?: string | null): Promise<WorkspaceContext> {
  await claimInvites(user);
  // A member lands in the studio that invited them before their own empty workspace.
  const membership = await one<MembershipRow>(
    `${membershipSelect} FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = $1 AND ($3::text IS NULL OR w.id = $3) ${membershipFilter} ${membershipOrder} LIMIT 1`,
    [user.userId, hideOwnWorkspace(user), requestedId ?? null],
  );
  if ((membership && !isWorkspaceRole(membership.role)) || (!membership && requestedId)) {
    throw new WorkspaceAccessError();
  }
  if (!membership && closedStudio() && !isOwnerEmail(user.email)) throw new NoWorkspaceError();
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

async function members(workspaceId: string, withCodes = false) {
  return database().query<WorkspaceMember>(
    `SELECT user_id AS "userId", role, name, email, client_id AS "clientId", created_at AS "createdAt"${withCodes ? ', invite_code AS "inviteCode"' : ''}
     FROM workspace_members WHERE workspace_id = $1
     ORDER BY CASE WHEN role = 'owner' THEN 0 WHEN role = 'client' THEN 2 ELSE 1 END, created_at ASC, user_id ASC`,
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
const isMine = (user: AppUser, task: RecordItem) =>
  !!task.assignee && identitiesOf(user).some((v) => v.trim().toLowerCase() === task.assignee!.trim().toLowerCase());

function visibleTo(workspace: WorkspaceContext, rows: RecordItem[], user: AppUser) {
  if (workspace.role === 'client') return portalView(rows, workspace.clientId!);
  if (workspace.role === 'creative') return memberView(rows, identitiesOf(user));
  return rows;
}

async function payload(workspace: WorkspaceContext, user: AppUser, rows?: RecordItem[]) {
  rows ??= await all(workspace.id);
  const roster = workspace.role === 'client' ? [] : await members(workspace.id, canManageMembers(workspace.role));
  return {
    records: visibleTo(workspace, rows, user),
    user: { id: user.userId, name: user.fullName || user.displayName, email: user.email, image: user.image ?? null },
    workspace,
    // Members get the roster for display only: no e-mails, no pending invitations.
    members: canManageMembers(workspace.role) ? roster : roster.filter((m) => !m.userId.startsWith('invite:')).map((m) => ({ ...m, email: m.userId === user.userId ? m.email : null })),
    workspaces: await workspacesFor(user),
    today: dayIn(new Date()),
  };
}

function clientContextValid(workspace: WorkspaceContext, rows: RecordItem[]) {
  if (workspace.role !== 'client') return true;
  return !!workspace.clientId && rows.some((r) => r.kind === 'client' && r.id === workspace.clientId && !r.archived);
}

export async function GET(req?: Request) {
  try {
    const user = await identity(req);
    if (!user) return response({ error: 'Connectez-vous pour accéder à votre espace.' }, 401);
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

    if (body.action === 'invite-member') {
      if (!canManageMembers(workspace.role)) return response({ error: 'Seuls le propriétaire et les administrateurs peuvent inviter.' }, 403);
      const parsed = inviteFields.safeParse(body);
      if (!parsed.success) return response({ error: parsed.error.issues[0].message }, 400);
      const { email, role } = parsed.data;
      let clientId: string | null = null;
      if (role === 'client') {
        const client = rowsNow.find((r) => r.kind === 'client' && r.id === parsed.data.clientId && !r.archived);
        if (!client) return response({ error: 'Choisissez un client actif pour cet accès portail.' }, 400);
        clientId = client.id;
      }
      const duplicate = await one<{ userId: string }>(
        'SELECT user_id AS "userId" FROM workspace_members WHERE workspace_id = $1 AND (user_id = $2 OR lower(email) = $3)',
        [workspace.id, inviteId(email), email],
      );
      if (duplicate) return response({ error: 'Cette adresse a déjà un accès ou une invitation en attente.' }, 409);
      await db.query(
        'INSERT INTO workspace_members (workspace_id, user_id, role, email, client_id, invite_code, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [workspace.id, inviteId(email), role, email, clientId, newInviteCode(), now],
      );
      return response({ workspace, members: await members(workspace.id, true) });
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
      if (!canManageMembers(workspace.role)) return response({ error: 'Action réservée aux administrateurs.' }, 403);
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
    if (workspace.role === 'creative' && body.kind === 'client') {
      return response({ error: 'Votre rôle ne peut pas gérer les clients.' }, 403);
    }
    const rows = rowsNow;
    const existing =
      body.action === 'update'
        ? rows.find((record) => record.id === body.id && record.kind === body.kind)
        : undefined;
    if (body.action === 'update' && !existing) return response({ error: 'Élément introuvable.' }, 404);
    if (workspace.role === 'creative') {
      if (body.kind === 'project') return response({ error: 'Les sous-projets sont gérés par les administrateurs.' }, 403);
      if (existing && !isMine(user, existing)) return response({ error: 'Élément introuvable.' }, 404);
    }

    const parsed = fields.safeParse(body.data);
    if (!parsed.success) return response({ error: parsed.error.issues[0].message }, 400);
    const data = parsed.data;
    if (workspace.role === 'creative' && body.kind === 'task') {
      // A member's tasks are their own: created for themselves, never handed to someone else.
      if (!data.assignee) data.assignee = user.fullName || user.displayName;
      else if (!identitiesOf(user).some((v) => v.trim().toLowerCase() === data.assignee!.trim().toLowerCase())) {
        return response({ error: 'Vous ne pouvez assigner une tâche qu’à vous-même.' }, 403);
      }
    }
    if (body.kind === 'task' && data.assignee) {
      const availableMembers = await members(workspace.id);
      const allowedAssignees = new Set(
        availableMembers.filter((m) => isStudioRole(m.role)).flatMap((member) => [member.name, member.email].filter((value): value is string => !!value)),
      );
      const unchangedLegacyAssignee = body.action === 'update' && existing?.assignee === data.assignee;
      if (!allowedAssignees.has(data.assignee) && !unchangedLegacyAssignee) {
        return response({ error: 'Choisissez une personne de l’équipe pour l’assignation.' }, 400);
      }
    }
    if (workspace.role === 'creative' && !!data.archived !== !!existing?.archived) {
      return response({ error: 'Seuls les administrateurs peuvent archiver ou restaurer des éléments.' }, 403);
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
      const project = rows.find(
        (record) => record.kind === 'project' && record.id === data.projectId && record.clientId === data.clientId,
      );
      if (!project || (project.archived && !data.archived)) {
        return response({ error: 'Sélectionnez un sous-projet de ce client.' }, 400);
      }
      data.status = data.status || 'À faire';
      if (['À valider', 'Validé'].includes(data.status) && !data.deliverable) {
        return response({ error: 'Ajoutez un lien livrable avant la validation.' }, 400);
      }
      if (data.evergreen && data.due) {
        return response({ error: 'Un contenu de réserve n’a pas de date de publication. Retirez la date ou sortez-le de la réserve.' }, 400);
      }
      // J−7 lock: the calendar is frozen one week out. Admins may lift it explicitly; the lift is recorded.
      if (lockApplies(existing?.due, data.due, today)) {
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
    } else {
      await insert(item);
    }
    return result({ id: item.id });
  } catch (error) {
    if (error instanceof NoWorkspaceError) return response({ error: 'Aucun espace ne vous est attribué. Demandez une invitation au studio.', code: 'no-workspace' }, 403);
    if (error instanceof WorkspaceAccessError) return response({ error: 'Vous n’avez plus accès à cet espace.' }, 403);
    console.error('save record', error);
    return response({ error: 'Enregistrement impossible. Vos saisies sont conservées ; réessayez.' }, 503);
  }
}
