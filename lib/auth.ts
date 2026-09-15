// Sessions: a random token in an HttpOnly cookie, stored hashed. Nothing else identifies a user.
import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { database } from '@/lib/database';
import { readSessionSettings } from '@/lib/auth-settings';
import { hashToken } from '@/lib/session-token';

export type AppUser = { userId: string; displayName: string; fullName: string | null; email: string; mustChangePassword: boolean };
export const sessionSettings = () => readSessionSettings(env);
export const sessionCookieName = (secure: boolean) => secure ? '__Host-the-one.session' : 'the-one.session';
export { hashToken, sessionLifetimeSeconds } from '@/lib/session-token';

export function sessionCookie(secure: boolean, token: string, expires: Date) {
  return `${sessionCookieName(secure)}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure ? '; Secure' : ''}`;
}
export function clearSessionCookie(secure: boolean) {
  return `${sessionCookieName(secure)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

/** The raw session token from the request, if the cookie is well-formed and unique. */
export function sessionTokenFrom(requestHeaders: Headers, secure: boolean) {
  const name = sessionCookieName(secure);
  const cookies = (requestHeaders.get('cookie') ?? '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(name + '='));
  if (cookies.length !== 1) return null;
  const token = cookies[0].slice(name.length + 1);
  return /^[a-zA-Z0-9_-]{20,200}$/.test(token) ? token : null;
}

type SessionRow = { expires: Date | string; id: string; name: string | null; email: string; must_change_password: boolean };

export async function getAppUser(req?: Request): Promise<AppUser | null> {
  const settings = sessionSettings();
  if (!settings) return null;
  const token = sessionTokenFrom(req?.headers ?? await headers(), settings.secure);
  if (!token) return null;
  const hashed = await hashToken(token);
  const row = (await database().query<SessionRow>(
    `SELECT s.expires, u.id, u.name, u.email, u.must_change_password
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.session_token = $1`, [hashed],
  ))[0];
  if (!row) return null;
  const expires = new Date(row.expires).valueOf();
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    await database().query('DELETE FROM sessions WHERE session_token = $1', [hashed]);
    return null;
  }
  return { userId: row.id, fullName: row.name ?? null, displayName: row.name || row.email, email: row.email, mustChangePassword: row.must_change_password };
}

export async function deleteSession(token: string) {
  await database().query('DELETE FROM sessions WHERE session_token = $1', [await hashToken(token)]);
}
