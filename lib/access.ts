// Closed-studio access: only the configured owner address opens a workspace by itself.
// Everyone else must have been invited (Google: pending invitation for the verified e-mail; password: invitation code).
// Leave OWNER_EMAIL unset to allow open sign-up (development and tests).
import type { Db } from '@/lib/database';
import { env } from '@/lib/env';
import { inviteId } from '@/lib/workspace';

export function ownerEmails() {
  return new Set((env.OWNER_EMAIL ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}
export const closedStudio = () => ownerEmails().size > 0;
export const isOwnerEmail = (email: string) => ownerEmails().has(email.trim().toLowerCase());

export async function hasPendingInvite(db: Db, email: string) {
  const rows = await db.query('SELECT 1 FROM workspace_members WHERE user_id = $1', [inviteId(email)]);
  return rows.length > 0;
}

export const normalizeInviteCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})$/, '$1-$2');

/** Marks the invitation for this e-mail as verified by its code. Claiming then happens at the first workspace load. */
export async function consumeInviteCode(db: Db, email: string, code: string) {
  const rows = await db.query(
    'UPDATE workspace_members SET invite_code = NULL WHERE user_id = $1 AND invite_code = $2 RETURNING workspace_id',
    [inviteId(email), normalizeInviteCode(code)],
  );
  return rows.length > 0;
}

/**
 * Decision for a Google sign-in. Existing accounts always pass (an optional code lets them join another studio).
 * New accounts: the owner, or an invitation whose code has been entered; otherwise a reason to show on the login page.
 */
export async function googleAdmission(db: Db, email: string, isExistingAccount: boolean, code: string | null) {
  if (code) {
    if (!(await consumeInviteCode(db, email, code))) return 'InvalidInviteCode';
    return 'ok';
  }
  if (isExistingAccount || !closedStudio() || isOwnerEmail(email)) return 'ok';
  return (await hasPendingInvite(db, email)) ? 'InviteCodeRequired' : 'AccessDenied';
}
