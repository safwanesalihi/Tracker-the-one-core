// E-mail + password sign-in and sign-up. Issues the same hashed-token session cookie as Google sign-in,
// so getAppUser, sign-out and every API route treat both kinds of session identically.
import { z } from 'zod';
import { database, type Db } from '@/lib/database';
import { hashToken } from '@/lib/auth-adapter';
import { hashPassword, passwordPolicy, verifyPassword } from '@/lib/password';
import { inviteId } from '@/lib/workspace';
import { closedStudio, isOwnerEmail } from '@/lib/access';

export const lockout = { attempts: 5, minutes: 15 };
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

export const passwordCredentials = z.object({
  action: z.enum(['sign-in', 'sign-up']),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.').max(200),
  password: z.string().min(1, 'Saisissez votre mot de passe.').max(passwordPolicy.maxLength),
  name: z.string().trim().max(120).optional(),
  inviteCode: z.string().trim().toUpperCase().max(20).optional(),
});
export type PasswordCredentials = z.infer<typeof passwordCredentials>;

export class PasswordAuthError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type UserRow = { id: string; name: string | null; email: string; password_hash: string | null; failed_logins: number; locked_until: Date | string | null };

export function newInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
const normalizeCode = (code: string) => code.replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})$/, '$1-$2');

async function claimByCode(db: Db, userId: string, name: string | null, email: string, code: string) {
  const claimed = await db.query<{ workspace_id: string }>(
    `UPDATE workspace_members SET user_id = $1, name = $2, email = $3, invite_code = NULL
     WHERE user_id = $4 AND invite_code = $5
       AND NOT EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = workspace_members.workspace_id AND m.user_id = $1)
     RETURNING workspace_id`,
    [userId, name, email, inviteId(email), code],
  );
  return claimed.length;
}

/** Returns the raw session token to place in the cookie. */
async function openSession(db: Db, userId: string) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
  const expires = new Date(Date.now() + sessionLifetimeSeconds * 1000);
  await db.query('INSERT INTO sessions (session_token, user_id, expires) VALUES ($1, $2, $3)', [await hashToken(token), userId, expires]);
  return { token, expires };
}

export async function signInWithPassword(input: PasswordCredentials) {
  const db = database();
  const email = input.email;
  const code = input.inviteCode ? normalizeCode(input.inviteCode) : null;
  const invalid = () => new PasswordAuthError('E-mail ou mot de passe incorrect.', 401);

  if (input.action === 'sign-up') {
    if (input.password.length < passwordPolicy.minLength) throw new PasswordAuthError(`Choisissez un mot de passe d’au moins ${passwordPolicy.minLength} caractères.`);
    if (!input.name) throw new PasswordAuthError('Indiquez votre nom.');
    const existing = (await db.query<UserRow>('SELECT id, password_hash FROM users WHERE email = $1', [email]))[0];
    // Never attach a password to an account created through Google: that would let anyone who knows the e-mail take it over.
    if (existing) throw new PasswordAuthError(existing.password_hash
      ? 'Cette adresse a déjà un compte. Utilisez « Se connecter » avec votre mot de passe.'
      : 'Cette adresse est connectée avec Google. Utilisez « Continuer avec Google ».', 409);
    if (closedStudio() && !isOwnerEmail(email) && !code) {
      throw new PasswordAuthError('Accès sur invitation : saisissez le code d’invitation fourni par le studio.', 403);
    }
    if (code) {
      const invite = await db.query('SELECT 1 FROM workspace_members WHERE user_id = $1 AND invite_code = $2', [inviteId(email), code]);
      if (!invite.length) throw new PasswordAuthError('Code d’invitation invalide pour cette adresse.', 400);
    }
    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(input.password);
    return db.transaction(async (tx) => {
      await tx.query('INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)', [id, input.name, email, passwordHash]);
      if (code) await claimByCode(tx, id, input.name!, email, code);
      const session = await openSession(tx, id);
      return { userId: id, ...session };
    });
  }

  const user = (await db.query<UserRow>('SELECT id, name, email, password_hash, failed_logins, locked_until FROM users WHERE email = $1', [email]))[0];
  // Always run a hash comparison so a missing account costs the same time as a wrong password.
  const lockedUntil = user?.locked_until ? new Date(user.locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    throw new PasswordAuthError(`Trop de tentatives. Réessayez dans ${Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60000))} min.`, 429);
  }
  const ok = await verifyPassword(input.password, user?.password_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AA==');
  if (user && !user.password_hash) throw new PasswordAuthError('Cette adresse est connectée avec Google. Utilisez « Continuer avec Google ».', 409);
  if (!user || !user.password_hash || !ok) {
    if (user?.password_hash) {
      const failures = (user.failed_logins ?? 0) + 1;
      const lock = failures >= lockout.attempts ? new Date(Date.now() + lockout.minutes * 60000) : null;
      await db.query('UPDATE users SET failed_logins = $2, locked_until = $3 WHERE id = $1', [user.id, lock ? 0 : failures, lock]);
    }
    throw invalid();
  }
  return db.transaction(async (tx) => {
    await tx.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
    if (code) {
      const claimed = await claimByCode(tx, user.id, user.name, email, code);
      if (!claimed) throw new PasswordAuthError('Code d’invitation invalide pour cette adresse.', 400);
    }
    const session = await openSession(tx, user.id);
    return { userId: user.id, ...session };
  });
}

export function sessionCookie(name: string, token: string, expires: Date, secure: boolean) {
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure ? '; Secure' : ''}`;
}
