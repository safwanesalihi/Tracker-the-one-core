// The only place the app reads process.env. Tests swap this module for a controlled object.
export type AppEnvironment = {
  AUTH_URL?: string;          // exact origin the browser uses, e.g. https://tracker.the1core.com
  OWNER_EMAIL?: string;       // the one owner account
  OWNER_PASSWORD?: string;    // seeds (or re-arms) the owner account; change the password after first login
  GMAIL_USER?: string;        // Gmail address that sends invitations
  GMAIL_APP_PASSWORD?: string;// Google "App password" for that address (2-step verification required)
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  CRON_SECRET?: string;
  NODE_ENV?: string;
};

export const env: AppEnvironment = process.env as AppEnvironment;
