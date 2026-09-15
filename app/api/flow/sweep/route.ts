import { env } from '@/lib/env';
import { sweepAllWorkspaces } from '@/lib/flow-server';

export const dynamic = 'force-dynamic';

// Cron entry point. Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically
// (vercel.json → crons); any external scheduler can do the same.
async function run(req: Request) {
  const secret = env.CRON_SECRET;
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || secret.length < 32 || provided.length !== secret.length) {
    return Response.json({ error: 'Balayage non autorisé.' }, { status: secret ? 401 : 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const a = new TextEncoder().encode(provided), b = new TextEncoder().encode(secret);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff) return Response.json({ error: 'Balayage non autorisé.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  try {
    const result = await sweepAllWorkspaces();
    return Response.json({ ok: true, ...result, at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('flow sweep', error);
    return Response.json({ error: 'Balayage impossible.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const GET = run;
export const POST = run;
