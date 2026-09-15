import { strict as assert } from 'node:assert';
import { globSync, mkdirSync } from 'node:fs';
import { createTestDb } from './helpers/pg.mjs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const authRequire = createRequire(import.meta.resolve('@auth/core'));
const { generateKeyPair, exportJWK, SignJWT } = await import(pathToFileURL(authRequire.resolve('jose')));

const esbuildPath = globSync('node_modules/.pnpm/esbuild@*/node_modules/esbuild/lib/main.js')[0] || 'node_modules/esbuild/lib/main.js';
const esbuild = await import(pathToFileURL(esbuildPath));
mkdirSync('.sites-runtime/auth-tests', { recursive: true });
await esbuild.build({
  entryPoints: { auth: 'lib/auth.ts', settings: 'lib/auth-settings.ts', records: 'app/api/records/route.ts', status: 'app/api/auth/status/route.ts' },
  outdir: '.sites-runtime/auth-tests', outExtension: { '.js': '.mjs' },
  bundle: true, platform: 'node', format: 'esm', external: ['@auth/core', '@auth/core/*'],
  plugins: [{ name: 'auth-test-runtime', setup(build) {
    build.onResolve({ filter: /^(@\/lib\/env|next\/headers|@\/lib\/database)$/ }, (args) => ({ path: args.path, namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, (args) => ({ contents:
      args.path === '@/lib/env' ? 'export const env = globalThis.authTestEnv;' :
      args.path === 'next/headers' ? 'export async function headers() { return new Headers(); }' :
      'export function database() { return globalThis.authTestDb; }\nexport const batch = (db, statements) => db.transaction(async (tx) => { for (const s of statements) await tx.query(s.text, s.params); });', loader: 'js' }));
  } }],
});
const { db, pg } = await createTestDb();
let failDeletion = false;
// Same Db shape as lib/database, plus a switch to simulate a storage outage on session deletion.
globalThis.authTestDb = {
  async query(text, params) { if (failDeletion && /DELETE FROM sessions/.test(text)) throw new Error('Test storage outage'); return db.query(text, params); },
  transaction: (fn) => db.transaction(fn),
};
const origin = 'https://tracker.test';
const config = { AUTH_URL: origin, AUTH_SECRET: 'test-only-secret-'.repeat(4), AUTH_GOOGLE_ID: 'test.apps.googleusercontent.com', AUTH_GOOGLE_SECRET: 'test-only-google-secret' };
globalThis.authTestEnv = { ...config };
const { handleAuth, getAppUser, authAdapter, authConfig, authSettings } = await import(pathToFileURL(process.cwd() + '/.sites-runtime/auth-tests/auth.mjs'));
const { readAuthSettings, safeCallbackUrl } = await import(pathToFileURL(process.cwd() + '/.sites-runtime/auth-tests/settings.mjs'));
const records = await import(pathToFileURL(process.cwd() + '/.sites-runtime/auth-tests/records.mjs'));
const status = await import(pathToFileURL(process.cwd() + '/.sites-runtime/auth-tests/status.mjs'));
for (const AUTH_URL of ['http://example.com', 'https://u:p@tracker.test', origin + '/subpath', origin + '?x=1', 'https://tracker.chatgpt.site']) assert.equal(readAuthSettings({ ...config, AUTH_URL }), null);
assert.ok(readAuthSettings({ ...config, AUTH_URL: 'http://127.0.0.1:5173' }));
assert.equal(readAuthSettings({ ...config, AUTH_SECRET: 'short' }), null);
assert.equal(safeCallbackUrl('//malicious.test', origin), origin + '/');
assert.equal(safeCallbackUrl('/#team', origin), origin + '/#team');

function jarHeader(jar) { return Array.from(jar, ([name, value]) => `${name}=${value}`).join('; '); }
function absorb(jar, response) {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0], equal = pair.indexOf('=');
    const name = pair.slice(0, equal), value = pair.slice(equal + 1);
    if (!value || /Max-Age=0/i.test(cookie)) jar.delete(name); else jar.set(name, value);
  }
}
async function auth(path, { jar = new Map(), method = 'GET', body, headers = {}, requestOrigin = origin } = {}) {
  const response = await handleAuth(new Request(requestOrigin + path, { method, headers: { cookie: jarHeader(jar), ...(method === 'POST' ? { origin, 'content-type': 'application/x-www-form-urlencoded' } : {}), ...headers }, body: body ? new URLSearchParams(body) : undefined }));
  absorb(jar, response); return response;
}
const identityRequest = (jar) => new Request(origin + '/api/records', { headers: { cookie: jarHeader(jar) } });
assert.equal(await getAppUser(new Request(origin, { headers: { 'oai-authenticated-user-id': 'owner-a', 'oai-authenticated-user-email': 'owner@example.test', cookie: '__sites_local_auth=1' } })), null);
assert.equal((await records.GET(identityRequest(new Map()))).status, 401);
globalThis.authTestEnv.AUTH_GOOGLE_SECRET = '';
assert.equal((await status.GET().json()).googleConfigured, false);
assert.equal((await auth('/api/auth/signin/google')).status, 503);
Object.assign(globalThis.authTestEnv, config);
assert.equal((await auth('/api/auth/csrf', { requestOrigin: 'https://evil.test' })).status, 403);
assert.equal((await auth('/api/auth/signout', { method: 'POST', headers: { origin: 'https://evil.test' } })).status, 403);

// Exercise the real Auth.js authorization-code flow with an isolated Google transport.
// No real credentials, Google account, network requests, or user database are used.
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const codes = new Map();
const accessTokens = new Map(); // access token → profile the userinfo endpoint returns
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === 'https://accounts.google.com/.well-known/openid-configuration') return Response.json({
    issuer: 'https://accounts.google.com', authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint: 'https://oauth2.googleapis.com/token', jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
    userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'], code_challenge_methods_supported: ['S256'],
  });
  if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
  if (url === 'https://oauth2.googleapis.com/token') {
    const body = new URLSearchParams(init.body), data = codes.get(body.get('code'));
    assert.ok(data, 'Only one-use test authorization codes may be exchanged');
    codes.delete(body.get('code'));
    const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.get('code_verifier')))).toString('base64url');
    assert.equal(challenge, data.challenge, 'PKCE verifier must match');
    assert.equal(body.get('redirect_uri'), origin + '/api/auth/callback/google');
    const token = await new SignJWT({ email: data.email, email_verified: data.verified ?? true, name: 'Google Test User', picture: data.picture ?? 'https://lh3.googleusercontent.com/test-avatar', nonce: data.nonceOverride ?? data.nonce })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer('https://accounts.google.com')
      .setAudience(data.audience ?? config.AUTH_GOOGLE_ID).setSubject(data.sub).setIssuedAt().setExpirationTime(data.expired ? Math.floor(Date.now() / 1000) - 3600 : '5m').sign(privateKey);
    const accessToken = 'test-access-' + crypto.randomUUID();
    accessTokens.set(accessToken, { sub: data.sub, email: data.email, email_verified: data.verified ?? true, name: 'Google Test User', picture: data.picture ?? 'https://lh3.googleusercontent.com/test-avatar' });
    return Response.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600, id_token: token });
  }
  if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
    const claims = accessTokens.get((init?.headers?.authorization ?? init?.headers?.Authorization ?? new Headers(init?.headers).get('authorization') ?? '').replace(/^Bearer /, ''));
    assert.ok(claims, 'userinfo must be requested with the access token just issued');
    return Response.json(claims);
  }
  throw new Error('Unexpected external request: ' + url);
};
async function begin(overrides = {}, callbackUrl = origin + '/#home') {
  const jar = new Map();
  const csrf = await (await auth('/api/auth/csrf', { jar })).json();
  const response = await auth('/api/auth/signin/google', { jar, method: 'POST', body: { csrfToken: csrf.csrfToken, callbackUrl } });
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://accounts.google.com');
  assert.equal(location.searchParams.get('scope'), 'openid email profile');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(location.searchParams.get('state')); assert.ok(location.searchParams.get('nonce'));
  const code = crypto.randomUUID();
  codes.set(code, { sub: 'google-subject-a', email: 'person@example.test', challenge: location.searchParams.get('code_challenge'), nonce: location.searchParams.get('nonce'), ...overrides });
  return { jar, code, state: location.searchParams.get('state') };
}
async function finish(flow, state = flow.state) { return auth(`/api/auth/callback/google?${new URLSearchParams({ code: flow.code, state })}`, { jar: flow.jar }); }
try {
  const noCsrf = await auth('/api/auth/signin/google', { method: 'POST', body: { callbackUrl: origin } });
  assert.ok(!noCsrf.headers.get('location')?.startsWith('https://accounts.google.com'));
  const forged = await begin(); await finish(forged, 'forged-state'); assert.equal(await getAppUser(identityRequest(forged.jar)), null);
  const missingCookie = await begin(); missingCookie.jar.clear(); await finish(missingCookie); assert.equal(await getAppUser(identityRequest(missingCookie.jar)), null);
  for (const bad of [{ verified: false }, { nonceOverride: 'wrong' }, { audience: 'different-client' }, { expired: true }]) {
    const flow = await begin(bad); await finish(flow); assert.equal(await getAppUser(identityRequest(flow.jar)), null);
  }
  const flow = await begin({}, 'https://malicious.test');
  const callback = await finish(flow);
  assert.equal(callback.headers.get('location'), origin + '/');
  assert.match(callback.headers.getSetCookie().find(c => c.startsWith('__Host-the-one.session=')), /HttpOnly/);
  assert.match(callback.headers.getSetCookie().find(c => c.startsWith('__Host-the-one.session=')), /Secure/);
  assert.match(callback.headers.getSetCookie().find(c => c.startsWith('__Host-the-one.session=')), /SameSite=Lax/i);
  const user = await getAppUser(identityRequest(flow.jar)); assert.equal(user.email, 'person@example.test');
  assert.equal(user.image, 'https://lh3.googleusercontent.com/test-avatar');
  const snapshot = await (await records.GET(identityRequest(flow.jar))).json();
  assert.equal(snapshot.workspace.role, 'owner'); assert.deepEqual(snapshot.records, []);
  assert.equal(snapshot.user.image, user.image);
  const token = flow.jar.get('__Host-the-one.session');
  const stored = (await pg.query('SELECT session_token FROM sessions WHERE user_id = $1', [user.userId])).rows[0];
  assert.notEqual(stored.session_token, token);
  // The accounts table has no token columns at all: nothing from Google can be stored by mistake.
  const accountColumns = (await pg.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'accounts'")).rows.map((r) => r.column_name);
  assert.deepEqual(accountColumns.sort(), ['id', 'provider', 'provider_account_id', 'type', 'user_id']);
  const sessionData = await (await auth('/api/auth/session', { jar: flow.jar })).json();
  assert.equal(sessionData.user.id, user.userId); assert.equal(sessionData.sessionToken, undefined);
  const again = await begin({ picture: 'https://lh3.googleusercontent.com/updated-avatar' }); await finish(again); assert.equal((await getAppUser(identityRequest(again.jar))).userId, user.userId);
  assert.equal((await getAppUser(identityRequest(again.jar))).image, 'https://lh3.googleusercontent.com/updated-avatar');
  const other = await begin({ sub: 'google-subject-b', email: 'second@example.test' }); await finish(other);
  assert.equal((await records.GET(new Request(origin + '/api/records', { headers: { cookie: jarHeader(other.jar), 'X-Workspace-Id': snapshot.workspace.id } }))).status, 403);
  const revoked = flow.jar.get('__Host-the-one.session');
  const csrf = await (await auth('/api/auth/csrf', { jar: flow.jar })).json();
  await auth('/api/auth/signout', { jar: flow.jar, method: 'POST', body: { csrfToken: 'wrong', callbackUrl: origin } });
  assert.ok(await getAppUser(identityRequest(new Map([['__Host-the-one.session', revoked]]))));
  const signout = await auth('/api/auth/signout', { jar: flow.jar, method: 'POST', body: { csrfToken: csrf.csrfToken, callbackUrl: origin } });
  assert.equal(signout.status, 302);
  assert.equal(await getAppUser(identityRequest(new Map([['__Host-the-one.session', revoked]]))), null);
  const expiring = again.jar.get('__Host-the-one.session');
  const hashed = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expiring))).toString('hex');
  await pg.query('UPDATE sessions SET expires = $1 WHERE session_token = $2', ['2000-01-01T00:00:00.000Z', hashed]);
  assert.equal(await getAppUser(identityRequest(again.jar)), null);
  assert.equal(await getAppUser(identityRequest(new Map([['__Host-the-one.session', 'a'.repeat(64)]]))), null);
  assert.equal(await getAppUser(new Request(origin, { headers: { cookie: `__Host-the-one.session=${token}; __Host-the-one.session=${token}` } })), null);
  // Local cookies cannot be used as production cookies.
  assert.equal(await getAppUser(identityRequest(new Map([['the-one.session', other.jar.get('__Host-the-one.session')]]))), null);
  assert.equal(authConfig(authSettings()).cookies.sessionToken.options.httpOnly, true);
  // Failed storage revocation must not report a successful logout or lose the retry cookie.
  const otherCsrf = await (await auth('/api/auth/csrf', { jar: other.jar })).json();
  failDeletion = true;
  const failedLogout = await auth('/api/auth/signout', { jar: other.jar, method: 'POST', body: { csrfToken: otherCsrf.csrfToken, callbackUrl: origin } });
  assert.equal(failedLogout.status, 503);
  assert.ok(other.jar.has('__Host-the-one.session'));
  failDeletion = false;
  await auth('/api/auth/signout', { jar: other.jar, method: 'POST', body: { csrfToken: otherCsrf.csrfToken, callbackUrl: origin } });
  assert.equal(await getAppUser(identityRequest(other.jar)), null);
  console.log('Google auth checks passed: full mocked OAuth, PKCE/state/nonce, CSRF, verified identity, sessions, revocation, expiry and workspace isolation.');
} finally { globalThis.fetch = realFetch; await pg.close(); }
