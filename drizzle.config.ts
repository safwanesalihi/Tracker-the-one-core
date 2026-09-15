import { defineConfig } from 'drizzle-kit';

// `drizzle-kit migrate` needs a direct (session-mode) connection: DIRECT_URL, falling back to DATABASE_URL.
try { process.loadEnvFile?.('.env'); } catch { /* no .env yet */ }

export default defineConfig({
  out: './drizzle',
  schema: './db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgres://localhost:5432/the_one_core' },
});
