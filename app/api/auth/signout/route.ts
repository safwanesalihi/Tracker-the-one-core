import { clearSessionCookie, deleteSession, sessionSettings, sessionTokenFrom } from '@/lib/auth';
import { sameOrigin } from '@/lib/auth-settings';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const settings = sessionSettings();
  if (!settings) return Response.json({ error: 'Connexion non configurée.' }, { status: 503 });
  if (!sameOrigin(req)) return Response.json({ error: 'Origine non autorisée.' }, { status: 403 });
  const token = sessionTokenFrom(req.headers, settings.secure);
  try {
    if (token) await deleteSession(token);
  } catch (error) {
    // Keep the cookie so the person can retry: a "signed out" answer must mean the session is really gone.
    console.error('signout', error);
    return Response.json({ error: 'Déconnexion impossible. Réessayez.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie(settings.secure), 'Cache-Control': 'no-store' } });
}
