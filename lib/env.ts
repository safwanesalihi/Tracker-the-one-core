// The only place the app reads process.env. Tests swap this module for a controlled object.
import type { AuthEnvironment } from '@/lib/auth-settings';

export type AppEnvironment = AuthEnvironment & {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  CRON_SECRET?: string;
  NODE_ENV?: string;
};

export const env: AppEnvironment = process.env as AppEnvironment;
