// A fresh in-memory Postgres (PGlite) with the app's migrations applied, exposed through lib/database's Db shape.
import { PGlite } from '@electric-sql/pglite';
import { globSync, readFileSync } from 'node:fs';

export async function createTestDb() {
  const pg = new PGlite();
  for (const file of globSync('drizzle/*.sql').sort()) await pg.exec(readFileSync(file, 'utf8').replaceAll('--> statement-breakpoint', ''));
  const wrap = (client) => ({
    async query(text, params = []) { return (await client.query(text, params)).rows; },
    async transaction(fn) { return pg.transaction((tx) => fn(wrap(tx))); },
  });
  return { db: wrap(pg), pg };
}

/** esbuild plugin: stubs the modules that reach outside the code under test. */
export function testRuntimePlugin({ auth = true } = {}) {
  return {
    name: 'test-runtime',
    setup(build) {
      build.onResolve({ filter: /^(@\/lib\/database|@\/lib\/env|next\/headers|@\/lib\/auth)$/ }, (args) => {
        if (args.path === '@/lib/auth' && !auth) return { path: 'auth', namespace: 'test' };
        if (args.path === '@/lib/auth') return undefined;
        return { path: args.path, namespace: 'test' };
      });
      build.onLoad({ filter: /.*/, namespace: 'test' }, (args) => ({ loader: 'js', contents:
        args.path === 'auth' ? 'export async function getAppUser() { return globalThis.testUser; }' :
        args.path === '@/lib/env' ? 'export const env = globalThis.testEnv ?? {};' :
        args.path === 'next/headers' ? 'export async function headers() { return new Headers(); }' :
        'export function database() { return globalThis.testDb; }\nexport const batch = (db, statements) => db.transaction(async (tx) => { for (const s of statements) await tx.query(s.text, s.params); });',
      }));
    },
  };
}
