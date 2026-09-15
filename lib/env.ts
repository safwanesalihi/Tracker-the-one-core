// The only place the app reads process.env. Tests swap this module for a controlled object.
import type { AuthEnvironment } from '@/lib/auth-settings';

export type AppEnvironment = AuthEnvironment & {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  CRON_SECRET?: string;
  OWNER_EMAIL?: string;   // comma-separated; when set, only these addresses open a workspace without an invitation
  NODE_ENV?: string;
};

export const env: AppEnvironment = process.env as AppEnvironment;
