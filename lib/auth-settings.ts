export type AuthEnvironment = { AUTH_URL?: string };

/** The canonical origin (AUTH_URL): decides the cookie's Secure flag and the links sent in e-mails. */
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

/**
 * CSRF guard for state-changing requests: the browser's `Origin` must be the origin the request was
 * served on, and that origin must be https (or a local http dev origin). The app may live on several
 * hostnames at once — the custom domain and the *.vercel.app address — so AUTH_URL is not required
 * to match; it only names the canonical address (cookie security, links in e-mails).
 */
export function sameOrigin(req: Request) {
  const served = requestOrigin(req);
  const origin = req.headers.get('origin');
  if (!origin || origin !== served) return false;
  try {
    const url = new URL(served);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return url.protocol === 'https:' || (local && url.protocol === 'http:');
  } catch { return false; }
}
