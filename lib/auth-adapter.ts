// Auth.js adapter on the app's Postgres. Only what Google OAuth with database sessions needs.
// Session tokens are stored as SHA-256 hashes; Google access / refresh / id tokens are discarded.
import type { Adapter, AdapterAccount, AdapterSession, AdapterUser } from '@auth/core/adapters';
import type { Db } from '@/lib/database';

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

type UserRow = { id: string; name: string | null; email: string; email_verified: Date | string | null; image: string | null };
type SessionRow = { session_token: string; user_id: string; expires: Date | string };

const asDate = (value: Date | string | null) => value === null ? null : value instanceof Date ? value : new Date(value);
const user = (row: UserRow): AdapterUser => ({ id: row.id, name: row.name, email: row.email, emailVerified: asDate(row.email_verified), image: row.image });

export function postgresAuthAdapter(db: Db): Adapter {
  const one = async <T,>(text: string, params: unknown[]) => (await db.query<T>(text, params))[0] ?? null;
  return {
    async createUser(data) {
      const id = crypto.randomUUID();
      const row = await one<UserRow>(
        'INSERT INTO users (id, name, email, email_verified, image) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [id, data.name ?? null, data.email, data.emailVerified ?? null, data.image ?? null],
      );
      return user(row!);
    },
    async getUser(id) {
      const row = await one<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
      return row ? user(row) : null;
    },
    async getUserByEmail(email) {
      const row = await one<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
      return row ? user(row) : null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const row = await one<UserRow>(
        'SELECT u.* FROM users u JOIN accounts a ON a.user_id = u.id WHERE a.provider = $1 AND a.provider_account_id = $2',
        [provider, providerAccountId],
      );
      return row ? user(row) : null;
    },
    async updateUser(data) {
      const row = await one<UserRow>(
        `UPDATE users SET name = COALESCE($2, name), email = COALESCE($3, email), email_verified = COALESCE($4, email_verified), image = COALESCE($5, image)
         WHERE id = $1 RETURNING *`,
        [data.id, data.name ?? null, data.email ?? null, data.emailVerified ?? null, data.image ?? null],
      );
      if (!row) throw new Error('User not found');
      return user(row);
    },
    async deleteUser(id) {
      await db.query('DELETE FROM users WHERE id = $1', [id]);
    },
    async linkAccount(account) {
      // Identity only: which Google subject belongs to which user. Tokens are dropped on purpose.
      await db.query(
        'INSERT INTO accounts (id, user_id, type, provider, provider_account_id) VALUES ($1, $2, $3, $4, $5)',
        [crypto.randomUUID(), account.userId, account.type, account.provider, account.providerAccountId],
      );
      // The signIn callback only lets verified Google e-mails through, so linking proves the address.
      await db.query('UPDATE users SET email_verified = COALESCE(email_verified, now()) WHERE id = $1', [account.userId]);
      return { userId: account.userId, type: account.type, provider: account.provider, providerAccountId: account.providerAccountId } as AdapterAccount;
    },
    async unlinkAccount({ provider, providerAccountId }) {
      await db.query('DELETE FROM accounts WHERE provider = $1 AND provider_account_id = $2', [provider, providerAccountId]);
    },
    async createSession(session) {
      await db.query('INSERT INTO sessions (session_token, user_id, expires) VALUES ($1, $2, $3)', [await hashToken(session.sessionToken), session.userId, session.expires]);
      return session;
    },
    async getSessionAndUser(sessionToken) {
      const row = await one<SessionRow & { u_id: string; u_name: string | null; u_email: string; u_email_verified: Date | string | null; u_image: string | null }>(
        `SELECT s.session_token, s.user_id, s.expires, u.id AS u_id, u.name AS u_name, u.email AS u_email, u.email_verified AS u_email_verified, u.image AS u_image
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.session_token = $1`,
        [await hashToken(sessionToken)],
      );
      if (!row) return null;
      const session: AdapterSession = { sessionToken, userId: row.user_id, expires: asDate(row.expires)! };
      return { session, user: user({ id: row.u_id, name: row.u_name, email: row.u_email, email_verified: row.u_email_verified, image: row.u_image }) };
    },
    async updateSession(session) {
      const row = await one<SessionRow>(
        'UPDATE sessions SET expires = COALESCE($2, expires) WHERE session_token = $1 RETURNING *',
        [await hashToken(session.sessionToken), session.expires ?? null],
      );
      return row ? { sessionToken: session.sessionToken, userId: row.user_id, expires: asDate(row.expires)! } : null;
    },
    async deleteSession(sessionToken) {
      await db.query('DELETE FROM sessions WHERE session_token = $1', [await hashToken(sessionToken)]);
      return null;
    },
  };
}
