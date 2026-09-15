// Session token helpers shared by sign-in and session lookup. No framework imports.
export const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
