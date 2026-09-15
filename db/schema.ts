import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// Auth.js tables (database sessions, Google OAuth only). Session tokens are stored hashed; provider tokens are never stored.
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  image: text('image'),
  passwordHash: text('password_hash'),          // scrypt; null for Google-only accounts
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
}, (t) => [uniqueIndex('idx_users_email').on(t.email)]);

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
}, (t) => [uniqueIndex('idx_accounts_provider').on(t.provider, t.providerAccountId), index('idx_accounts_user').on(t.userId)]);

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
}, (t) => [index('idx_sessions_user').on(t.userId)]);

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.identifier, t.token] })]);

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('idx_workspaces_created_by').on(t.createdBy)]);

export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),          // a real user id, or `invite:<email>` until claimed
  role: text('role').notNull().default('owner'),
  name: text('name'),
  email: text('email'),
  clientId: text('client_id'),                 // set for the `client` role: the one client this member may see
  inviteCode: text('invite_code'),             // lets a password sign-up claim this invitation; Google claims by verified e-mail
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.userId] }),
  index('idx_workspace_members_user').on(t.userId),
  index('idx_workspace_members_email').on(t.workspaceId, t.email),
]);

// Clients, projects, tasks, comments and events share one table; the shape lives in `data`.
export const records = pgTable('records', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  data: jsonb('data').notNull(),
  revision: integer('revision').notNull().default(1),
}, (t) => [index('idx_records_workspace_kind').on(t.workspaceId, t.kind)]);
