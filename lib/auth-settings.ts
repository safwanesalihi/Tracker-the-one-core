export type AuthEnvironment = {
  AUTH_URL?: string;
  AUTH_SECRET?: string;
  AUTH_GOOGLE_ID?: string;
  AUTH_GOOGLE_SECRET?: string;
};

/** Origin and session secret: enough for password sign-in and for reading sessions. */
export function readSessionSettings(env: AuthEnvironment) {
  const { AUTH_URL, AUTH_SECRET } = env;
  if (!AUTH_URL || !AUTH_SECRET || AUTH_SECRET.length < 32) return null;
  try {
    const url = new URL(AUTH_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    if (url.hostname.endsWith('.chatgpt.site')) return null;
    return { origin: url.origin, secret: AUTH_SECRET, secure: url.protocol === 'https:' };
  } catch { return null; }
}

/** Session settings plus the Google client: what Auth.js needs. */
export function readAuthSettings(env: AuthEnvironment) {
  const base = readSessionSettings(env);
  const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET } = env;
  if (!base || !AUTH_GOOGLE_ID?.endsWith('.apps.googleusercontent.com') || !AUTH_GOOGLE_SECRET) return null;
  return { ...base, clientId: AUTH_GOOGLE_ID, clientSecret: AUTH_GOOGLE_SECRET };
}

export function safeCallbackUrl(value: string, origin: string) {
  try {
    const url = new URL(value, origin);
    return url.origin === origin && !url.username && !url.password ? url.href : origin + '/';
  } catch { return origin + '/'; }
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
