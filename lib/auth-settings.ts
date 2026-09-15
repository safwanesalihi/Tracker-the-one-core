export type AuthEnvironment = { AUTH_URL?: string };

/** The configured origin: sessions are only issued to, and accepted from, requests on this exact origin. */
export function readSessionSettings(env: AuthEnvironment) {
  const { AUTH_URL } = env;
  if (!AUTH_URL) return null;
  try {
    const url = new URL(AUTH_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    return { origin: url.origin, secure: url.protocol === 'https:' };
  } catch { return null; }
}

/**
 * The origin the browser actually used. Next.js dev rewrites `req.url` to localhost and Vercel
 * fronts the app with a proxy, so the headers are the source of truth. Callers only ever
 * compare the result with the configured AUTH_URL, so a spoofed header gains nothing.
 */
export function requestOrigin(req: Request) {
  const url = new URL(req.url);
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host).split(',')[0].trim();
  const proto = (req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')).split(',')[0].trim();
  return `${proto}://${host}`;
}
