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

/** May this e-mail create an account through Google (verified e-mail)? Existing accounts are handled by the caller. */
export async function mayJoinByEmail(db: Db, email: string) {
  if (!closedStudio() || isOwnerEmail(email)) return true;
  return hasPendingInvite(db, email);
}
