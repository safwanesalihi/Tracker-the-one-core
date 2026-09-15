// One tiny interface over Postgres. Production: Supabase through postgres.js.
// Local development without DATABASE_URL: PGlite, an embedded Postgres kept in .data/pglite.
import { env } from '@/lib/env';

export type Row = Record<string, unknown>;
export type Db = {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
};
export type Statement = { text: string; params?: unknown[] };

/** Runs statements in one transaction, in order. */
export const batch = (db: Db, statements: Statement[]) =>
  db.transaction(async (tx) => { for (const s of statements) await tx.query(s.text, s.params); });

type Globals = typeof globalThis & { __theOneDb?: Promise<Db> };
const globals = globalThis as Globals;

export function database(): Db {
  // A thin proxy so callers stay synchronous; the connection is resolved on first use and retried if it failed.
  const pending = (globals.__theOneDb ??= connect().catch((error) => { globals.__theOneDb = undefined; throw error; }));
  return {
    query: async (text, params) => (await pending).query(text, params),
    transaction: async (fn) => (await pending).transaction(fn),
  };
}

async function connect(): Promise<Db> {
  if (env.DATABASE_URL) return postgresDb(env.DATABASE_URL);
  if (env.NODE_ENV === 'production') throw new Error('DATABASE_URL is not set.');
  return pgliteDb();
}

async function postgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import('postgres');
  // Supabase's transaction pooler (port 6543) does not support prepared statements.
  const sql = postgres(url, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 });
  const wrap = (client: typeof sql): Db => ({
    query: async <T,>(text: string, params: unknown[] = []) => (await client.unsafe(text, params as never)) as unknown as T[],
    transaction: (fn) => client.begin((tx) => fn(wrap(tx as unknown as typeof sql))) as Promise<never>,
  });
  return wrap(sql);
}

async function pgliteDb(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { mkdirSync, readdirSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dataDir = join(process.cwd(), '.data', 'pglite');
  mkdirSync(dataDir, { recursive: true });
  const pg = await PGlite.create({ dataDir });
  // Apply the Drizzle migrations that have not run yet; the same files Supabase gets through `drizzle-kit migrate`.
  await pg.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set((await pg.query<{ name: string }>('SELECT name FROM _local_migrations')).rows.map((r) => r.name));
  const dir = join(process.cwd(), 'drizzle');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue;
    await pg.exec(readFileSync(join(dir, file), 'utf8').replaceAll('--> statement-breakpoint', ''));
    await pg.query('INSERT INTO _local_migrations (name) VALUES ($1)', [file]);
  }
  type Client = { query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> };
  const wrap = (client: Client): Db => ({
    query: async <T,>(text: string, params: unknown[] = []) => (await client.query<T>(text, params)).rows,
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx as unknown as Client))),
  });
  return wrap(pg as unknown as Client);
}
