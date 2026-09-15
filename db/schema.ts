import { boolean, customType, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

// Accounts are created by the studio (invitation with a temporary password) or seeded (the owner). No self sign-up.
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  avatar: text('avatar'),                                  // asset id of the profile picture (see /api/assets)
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),          // scrypt
  mustChangePassword: boolean('must_change_password').notNull().default(false), // true while a temporary password is in force
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  invitedAt: timestamp('invited_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('idx_users_email').on(t.email)]);

// Session tokens are stored hashed; the browser holds the raw token in an HttpOnly cookie.
export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
}, (t) => [index('idx_sessions_user').on(t.userId)]);

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('idx_workspaces_created_by').on(t.createdBy)]);

export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  role: text('role').notNull().default('owner'),
  name: text('name'),
  email: text('email'),
  clientId: text('client_id'),                 // set for the `client` role: the one client this member may see
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

// Small images (client logos and banners), resized in the browser before upload.
export const assets = pgTable('assets', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),                  // 'logo' | 'banner'
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  bytes: bytea('bytes').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('idx_assets_workspace').on(t.workspaceId)]);
