// Serves an image to signed-in members of its workspace (profile pictures to any signed-in user). Ids are unique per upload, so responses cache forever.
import { getAppUser } from '@/lib/auth';
import { database } from '@/lib/database';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const user = await getAppUser(req);
  if (!user) return new Response('Unauthorized', { status: 401 });
  const row = (await database().query<{ content_type: string; bytes: Buffer | Uint8Array; size: number }>(
    `SELECT a.content_type, a.bytes, a.size FROM assets a
     WHERE a.id = $1 AND (a.kind = 'avatar' OR EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = a.workspace_id AND wm.user_id = $2))`, [id, user.userId],
  ))[0];
  if (!row) return new Response('Not found', { status: 404 });
  const body = row.bytes instanceof Uint8Array ? row.bytes : Buffer.from(row.bytes as unknown as string);
  return new Response(new Uint8Array(body), { headers: {
    'Content-Type': row.content_type, 'Content-Length': String(body.byteLength),
    'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
  } });
}
