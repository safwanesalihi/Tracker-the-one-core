import { sessionCookieName, sessionSettings } from '@/lib/auth';
import { requestOrigin } from '@/lib/auth-settings';
import { PasswordAuthError, passwordCredentials, sessionCookie, signInWithPassword } from '@/lib/password-auth';

export const dynamic = 'force-dynamic';

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export async function POST(req: Request) {
  const settings = sessionSettings();
  if (!settings) return json({ error: 'La connexion n’est pas encore configurée.' }, 503);
  if (requestOrigin(req) !== settings.origin || req.headers.get('origin') !== settings.origin) return json({ error: 'Origine non autorisée.' }, 403);
  if (!req.headers.get('content-type')?.includes('application/json')) return json({ error: 'Format invalide.' }, 415);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: 'Requête invalide.' }, 400); }
  const parsed = passwordCredentials.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
  try {
    const session = await signInWithPassword(parsed.data);
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(sessionCookieName(settings.secure), session.token, session.expires, settings.secure) });
  } catch (error) {
    if (error instanceof PasswordAuthError) return json({ error: error.message }, error.status);
    console.error('password sign-in', error);
    return json({ error: 'Connexion indisponible. Réessayez.' }, 503);
  }
}
