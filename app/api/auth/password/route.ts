import { getAppUser, sessionCookie, sessionSettings, sessionTokenFrom } from '@/lib/auth';
import { sameOrigin } from '@/lib/auth-settings';
import { changePassword, changePasswordInput, PasswordAuthError, signIn, signInInput } from '@/lib/password-auth';

export const dynamic = 'force-dynamic';

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export async function POST(req: Request) {
  const settings = sessionSettings();
  if (!settings) return json({ error: 'La connexion n’est pas encore configurée.' }, 503);
  if (!sameOrigin(req)) return json({ error: 'Origine non autorisée.' }, 403);
  if (!req.headers.get('content-type')?.includes('application/json')) return json({ error: 'Format invalide.' }, 415);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: 'Requête invalide.' }, 400); }
  const action = typeof body === 'object' && body ? (body as { action?: unknown }).action : undefined;
  try {
    if (action === 'sign-in') {
      const parsed = signInInput.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
      const session = await signIn(parsed.data);
      return json({ ok: true, mustChangePassword: session.mustChangePassword }, 200, { 'Set-Cookie': sessionCookie(settings.secure, session.token) });
    }
    if (action === 'change-password') {
      const user = await getAppUser(req);
      const token = sessionTokenFrom(req.headers, settings.secure);
      if (!user || !token) return json({ error: 'Connexion requise.' }, 401);
      const parsed = changePasswordInput.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
      await changePassword(user.userId, token, parsed.data);
      return json({ ok: true });
    }
    return json({ error: 'Action invalide.' }, 400);
  } catch (error) {
    if (error instanceof PasswordAuthError) return json({ error: error.message }, error.status);
    console.error('password auth', error);
    return json({ error: 'Connexion indisponible. Réessayez.' }, 503);
  }
}
