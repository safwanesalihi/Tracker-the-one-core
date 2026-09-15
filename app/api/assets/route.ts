// Upload a client logo or banner, or one's own profile picture. Images are resized in the browser first (lib/image.ts), so bodies stay small.
import { getAppUser } from '@/lib/auth';
import { requestOrigin } from '@/lib/auth-settings';
import { database } from '@/lib/database';
import { isManager, isWorkspaceRole } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const assetLimits = { maxBytes: 1_500_000, types: ['image/png', 'image/jpeg', 'image/webp'], kinds: ['logo', 'banner', 'avatar'] as const };

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  const user = await getAppUser(req);
  if (!user) return json({ error: 'Connexion requise.' }, 401);
  if (user.mustChangePassword) return json({ error: 'Choisissez votre mot de passe pour continuer.', code: 'password-change-required' }, 403);
  const origin = req.headers.get('origin');
  if (origin && origin !== requestOrigin(req)) return json({ error: 'Origine non autorisée.' }, 403);
  const workspaceId = req.headers.get('X-Workspace-Id');
  if (!workspaceId) return json({ error: 'Espace inconnu.' }, 400);
  const membership = (await database().query<{ role: string }>('SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, user.userId]))[0];
  if (!membership || !isWorkspaceRole(membership.role)) return json({ error: 'Votre rôle ne permet pas de modifier les images.' }, 403);
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: 'Envoi invalide.' }, 400); }
  const kind = String(form.get('kind') ?? '');
  const file = form.get('file');
  if (!assetLimits.kinds.includes(kind as 'logo' | 'banner' | 'avatar')) return json({ error: 'Type d’image inconnu.' }, 400);
  // Anyone may change their own picture; a client's logo/banner is studio-owned, owner/admin only.
  if (kind !== 'avatar' && !isManager(membership.role)) return json({ error: 'Votre rôle ne permet pas de modifier les images.' }, 403);
  if (!(file instanceof File)) return json({ error: 'Aucun fichier reçu.' }, 400);
  if (!assetLimits.types.includes(file.type)) return json({ error: 'Formats acceptés : PNG, JPEG, WebP.' }, 415);
  if (file.size === 0 || file.size > assetLimits.maxBytes) return json({ error: 'Image trop lourde (1,5 Mo maximum après redimensionnement).' }, 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const id = crypto.randomUUID();
  await database().query(
    'INSERT INTO assets (id, workspace_id, kind, content_type, size, bytes, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, workspaceId, kind, file.type, bytes.length, bytes, user.userId],
  );
  return json({ id });
}
