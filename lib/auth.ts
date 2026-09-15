import { Auth, type AuthConfig } from '@auth/core';
import Google from '@auth/core/providers/google';
import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { database } from '@/lib/database';
import { postgresAuthAdapter } from '@/lib/auth-adapter';
import { readAuthSettings, readSessionSettings, requestOrigin, safeCallbackUrl } from '@/lib/auth-settings';
import { googleProfileImage } from '@/lib/profile';
import { mayJoinByEmail } from '@/lib/access';

export type AppUser = { userId: string; displayName: string; fullName: string | null; email: string; image: string | null; verified: boolean };
export const authSettings = () => readAuthSettings(env);
export const sessionSettings = () => readSessionSettings(env);
export const sessionCookieName = (secure: boolean) => secure ? '__Host-the-one.session' : 'the-one.session';
const sessionLifetime = 60 * 60 * 24 * 7;

// Hashed session tokens and no provider tokens: see lib/auth-adapter.ts.
export function authAdapter() {
  return postgresAuthAdapter(database());
}

export function authConfig(settings: NonNullable<ReturnType<typeof authSettings>>): AuthConfig {
  return {
    basePath: '/api/auth',
    secret: settings.secret,
    // Allowed only after handleAuth's exact configured-origin check.
    trustHost: true,
    useSecureCookies: settings.secure,
    adapter: authAdapter(),
    session: { strategy: 'database', maxAge: sessionLifetime, updateAge: sessionLifetime,
      generateSessionToken: () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    },
    cookies: { sessionToken: { name: sessionCookieName(settings.secure), options: {
      httpOnly: true, secure: settings.secure, sameSite: 'lax', path: '/',
    } } },
    providers: [Google({
      clientId: settings.clientId, clientSecret: settings.clientSecret,
      checks: ['pkce', 'state', 'nonce'],
      authorization: { params: { scope: 'openid email profile', prompt: 'select_account' } },
      allowDangerousEmailAccountLinking: false,
      // Google Workspace accounts often omit `picture` from the ID token; the userinfo endpoint always
      // returns the current photo. The ID token is still validated (nonce, audience, expiry).
      // Provider-level option, merged at runtime; not part of the user-config type.
      ...({ idToken: false } as Record<string, unknown>),
    })],
    pages: { signIn: '/login', error: '/login' },
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== 'google' || profile?.email_verified !== true || typeof profile.email !== 'string') return false;
        // Refresh the photo only for this verified, already-linked Google identity.
        const adapter = authAdapter();
        const existing = await adapter.getUserByAccount!({ provider: 'google', providerAccountId: account.providerAccountId });
        if (existing) { await adapter.updateUser!({ id: existing.id, image: googleProfileImage(profile.picture) }); return true; }
        // New account: in a closed studio only the owner or an invited address may come in.
        return mayJoinByEmail(database(), profile.email);
      },
      redirect({ url }) { return safeCallbackUrl(url, settings.origin); },
      session({ session, user }) {
        // Never expose the database session token or provider tokens to browser JS.
        return { expires: session.expires, user: { id: user.id, name: user.name, email: user.email, image: user.image } };
      },
    },
    logger: {
      // Avoid logging callback codes, tokens, cookies, or provider response bodies.
      error(error) { console.error('Authentication failed', error.name); },
      warn(code) { console.warn('Authentication warning', code); },
      debug() {},
    },
  };
}

export async function handleAuth(req: Request) {
  const settings = authSettings();
  if (!settings) return Response.json({ error: 'La connexion Google n’est pas encore configurée.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const url = new URL(req.url);
  const origin = req.headers.get('origin');
  if (requestOrigin(req) !== settings.origin || (req.method !== 'GET' && origin !== settings.origin)) {
    return Response.json({ error: 'Origine non autorisée.' }, { status: 403 });
  }
  try {
    const config = authConfig(settings);
    let failed = false;
    const logError = config.logger!.error!;
    config.logger!.error = (error) => { failed = true; logError(error); };
    // Auth.js derives redirect and callback URLs from the request URL: pin it to the configured origin.
    const pinned = new Request(settings.origin + url.pathname + url.search, {
      method: req.method, headers: req.headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
    });
    const result = await Auth(pinned, config);
    const response = new Response(result.body, { status: result.status, statusText: result.statusText, headers: new Headers(result.headers) });
    // Auth.js clears the browser cookie even if deletion fails. Keep it available
    // for a retry instead of reporting a successful revocation that did not occur.
    if (failed && url.pathname === '/api/auth/signout') {
      return Response.json({ error: 'Déconnexion impossible. Réessayez.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  } catch {
    console.error('Authentication request unavailable');
    return Response.json({ error: 'Connexion indisponible. Réessayez.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function getAppUser(req?: Request): Promise<AppUser | null> {
  // Password sessions must work even when Google is not configured.
  const settings = sessionSettings();
  if (!settings) return null;
  const requestHeaders = req?.headers ?? await headers();
  // No fallback to ChatGPT headers, a development cookie, or a browser-supplied user ID.
  const name = sessionCookieName(settings.secure);
  const cookies = (requestHeaders.get('cookie') ?? '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(name + '='));
  if (cookies.length !== 1) return null;
  const token = cookies[0].slice(name.length + 1);
  if (!/^[a-zA-Z0-9_-]{20,200}$/.test(token)) return null;
  const adapter = authAdapter();
  const result = await adapter.getSessionAndUser!(token);
  if (!result || !result.user.email) return null;
  if (!Number.isFinite(result.session.expires.valueOf()) || result.session.expires.valueOf() <= Date.now()) {
    await adapter.deleteSession!(token);
    return null;
  }
  return { userId: result.user.id, fullName: result.user.name ?? null,
    displayName: result.user.name || result.user.email, email: result.user.email, image: googleProfileImage(result.user.image),
    // Only a verified e-mail (Google) may claim invitations by address; password accounts use an invitation code.
    verified: !!result.user.emailVerified };
}
