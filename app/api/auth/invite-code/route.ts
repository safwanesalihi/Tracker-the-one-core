import { inviteCookieName, sessionSettings } from '@/lib/auth';
import { requestOrigin } from '@/lib/auth-settings';
import { normalizeInviteCode } from '@/lib/access';

export const dynamic = 'force-dynamic';

// Stores the invitation code in a short-lived HttpOnly cookie before the Google redirect;
// the OAuth callback reads it to admit the invited address. Nothing is validated here.
export async function POST(req: Request) {
  const settings = sessionSettings();
  if (!settings) return Response.json({ error: 'Connexion non configurée.' }, { status: 503 });
  if (requestOrigin(req) !== settings.origin || req.headers.get('origin') !== settings.origin) return Response.json({ error: 'Origine non autorisée.' }, { status: 403 });
  let code = '';
  try { code = normalizeInviteCode(String(((await req.json()) as { code?: unknown }).code ?? '')); } catch { /* handled below */ }
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return Response.json({ error: 'Code d’invitation invalide (format AAAA-BBBB).' }, { status: 400 });
  const cookie = `${inviteCookieName(settings.secure)}=${encodeURIComponent(code)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${settings.secure ? '; Secure' : ''}`;
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
}
