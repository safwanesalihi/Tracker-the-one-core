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
  entryPoints: { auth: 'lib/auth.ts', settings: 'lib/auth-settings.ts', records: 'app/api/records/route.ts', status: 'app/api/auth/status/route.ts', invite: 'app/api/auth/invite-code/route.ts' },
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
const inviteRoute = await import(pathToFileURL(process.cwd() + '/.sites-runtime/auth-tests/invite.mjs'));
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
let userinfoCalls = 0;
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
    userinfoCalls++;
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
  assert.ok(userinfoCalls >= 3, 'profile (photo) is fetched from the userinfo endpoint, not read from the ID token');
  // Closed studio: a brand-new Google account that was not invited is refused before any row is written.
  globalThis.authTestEnv.OWNER_EMAIL = 'owner@studio.test';
  const uninvited = await begin({ sub: 'google-subject-c', email: 'uninvited@example.test' }); const refused = await finish(uninvited);
  assert.match(refused.headers.get('location') ?? '', /error=AccessDenied/);
  assert.equal(await getAppUser(identityRequest(uninvited.jar)), null);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM users WHERE email = 'uninvited@example.test'")).rows[0].n, 0);
  await pg.query("INSERT INTO workspaces (id, name, created_by) VALUES ('ws:host', 'Studio', 'host')");
  await pg.query("INSERT INTO workspace_members (workspace_id, user_id, role, email, invite_code) VALUES ('ws:host', 'invite:invited@example.test', 'viewer', 'invited@example.test', 'ABCD-EFGH')");
  // Invited, but no code entered → sent back to the login page asking for it; nothing written.
  const noCode = await begin({ sub: 'google-subject-d', email: 'invited@example.test' }); const askCode = await finish(noCode);
  assert.match(askCode.headers.get('location') ?? '', /error=InviteCodeRequired/);
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM users WHERE email = 'invited@example.test'")).rows[0].n, 0);
  // Wrong code → refused with a specific message.
  async function withCode(code, overrides) {
    const jar = new Map();
    const stored = await inviteRoute.POST(new Request(origin + '/api/auth/invite-code', { method: 'POST', headers: { origin, 'content-type': 'application/json', cookie: jarHeader(jar) }, body: JSON.stringify({ code }) }));
    assert.equal(stored.status, 200); absorb(jar, stored);
    assert.ok(jar.has('__Host-the-one.invite'), 'invite cookie set');
    const csrf = await (await auth('/api/auth/csrf', { jar })).json();
    const response = await auth('/api/auth/signin/google', { jar, method: 'POST', body: { csrfToken: csrf.csrfToken, callbackUrl: origin + '/#home' } });
    const location = new URL(response.headers.get('location'));
    const code2 = crypto.randomUUID();
    codes.set(code2, { sub: 'google-subject-d', email: 'invited@example.test', challenge: location.searchParams.get('code_challenge'), nonce: location.searchParams.get('nonce'), ...overrides });
    return { jar, code: code2, state: location.searchParams.get('state') };
  }
  assert.equal((await inviteRoute.POST(new Request(origin + '/api/auth/invite-code', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'nope' }) }))).status, 400);
  const wrong = await withCode('zzzz-zzzz'); const wrongDone = await finish(wrong);
  assert.match(wrongDone.headers.get('location') ?? '', /error=InvalidInviteCode/);
  assert.ok(!wrong.jar.has('__Host-the-one.invite'), 'invite cookie cleared after the callback');
  // Right code (typed loosely) → account created, invitation claimed on first load, and the code is gone.
  const invitedFlow = await withCode('abcd efgh'); await finish(invitedFlow);
  const invitedUser = await getAppUser(identityRequest(invitedFlow.jar)); assert.equal(invitedUser?.email, 'invited@example.test');
  const invitedView = await (await records.GET(identityRequest(invitedFlow.jar))).json();
  assert.equal(invitedView.workspace.id, 'ws:host'); assert.equal(invitedView.workspace.role, 'viewer');
  assert.deepEqual(invitedView.workspaces.map((w) => w.id), ['ws:host'], 'no personal workspace is created or offered');
  // Second sign-in: Google alone is enough.
  const returning = await begin({ sub: 'google-subject-d', email: 'invited@example.test' }); await finish(returning);
  assert.equal((await (await records.GET(identityRequest(returning.jar))).json()).workspace.id, 'ws:host');
  const existingFlow = await begin({ sub: 'google-subject-b', email: 'second@example.test' }); await finish(existingFlow);
  assert.ok(await getAppUser(identityRequest(existingFlow.jar)), 'accounts created earlier keep signing in');
  // The reverse: a password account's address cannot come in through Google — it is told to use its password.
  await pg.query("INSERT INTO users (id, name, email, password_hash) VALUES ('pw', 'Password Person', 'password@example.test', 'scrypt$x')");
  const viaGoogle = await begin({ sub: 'google-subject-e', email: 'password@example.test' }); const told = await finish(viaGoogle);
  assert.match(told.headers.get('location') ?? '', /error=UsePassword/);
  assert.equal(await getAppUser(identityRequest(viaGoogle.jar)), null);
  delete globalThis.authTestEnv.OWNER_EMAIL;
  console.log('Google auth checks passed: full mocked OAuth, PKCE/state/nonce, CSRF, verified identity, userinfo profile, sessions, revocation, expiry and workspace isolation.');
} finally { globalThis.fetch = realFetch; await pg.close(); }
