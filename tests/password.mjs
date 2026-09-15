// E-mail + password sign-in: hashing, lockout, invitation codes, Google-account protection, session reuse by the API.
import { strict as assert } from 'node:assert';
import { globSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createTestDb, testRuntimePlugin } from './helpers/pg.mjs';

const esbuildPath = globSync('node_modules/.pnpm/esbuild@*/node_modules/esbuild/lib/main.js')[0] || 'node_modules/esbuild/lib/main.js';
const esbuild = await import(pathToFileURL(esbuildPath));
mkdirSync('.sites-runtime/password-tests', { recursive: true });
await esbuild.build({
  entryPoints: { password: 'app/api/auth/password/route.ts', records: 'app/api/records/route.ts', status: 'app/api/auth/status/route.ts' },
  outdir: '.sites-runtime/password-tests', outExtension: { '.js': '.mjs' },
  bundle: true, platform: 'node', format: 'esm', external: ['@auth/core', '@auth/core/*'],
  plugins: [testRuntimePlugin({ auth: true })],
});
const { db, pg } = await createTestDb();
globalThis.testDb = db;
const origin = 'https://tracker.test';
globalThis.testEnv = { AUTH_URL: origin, AUTH_SECRET: 'test-only-secret-'.repeat(4), AUTH_GOOGLE_ID: 'test.apps.googleusercontent.com', AUTH_GOOGLE_SECRET: 'x' };
const password = await import(pathToFileURL(process.cwd() + '/.sites-runtime/password-tests/password.mjs'));
const records = await import(pathToFileURL(process.cwd() + '/.sites-runtime/password-tests/records.mjs'));
const status = await import(pathToFileURL(process.cwd() + '/.sites-runtime/password-tests/status.mjs'));

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const cookieOf = (response) => response.headers.getSetCookie().find((c) => c.startsWith('__Host-the-one.session='))?.split(';')[0] ?? null;

async function post(body, { status: expected = 200, headers = {} } = {}) {
  const response = await password.POST(new Request(origin + '/api/auth/password', { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) }));
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data)); checks++;
  return { data, cookie: cookieOf(response), response };
}
const api = (cookie, init = {}) => records.GET(new Request(origin + '/api/records', { headers: { cookie, ...(init.headers ?? {}) } }));
const mutate = (cookie, body) => records.POST(new Request(origin + '/api/records', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));

eq((await status.GET().json()), { googleConfigured: true, passwordConfigured: true });

// Validation and origin protection.
await post({ action: 'sign-up', email: 'not-an-email', password: 'long-enough-password', name: 'X' }, { status: 400 });
await post({ action: 'sign-up', email: 'safwane@studio.test', password: 'short', name: 'Safwane' }, { status: 400 });
await post({ action: 'sign-up', email: 'safwane@studio.test', password: 'long-enough-password' }, { status: 400 });
await post({ action: 'sign-in', email: 'safwane@studio.test', password: 'long-enough-password' }, { status: 403, headers: { origin: 'https://evil.test' } });

// Sign-up opens a session the API accepts; the owner gets a workspace.
const owner = await post({ action: 'sign-up', email: 'Safwane@Studio.test', password: 'correct-horse-battery', name: 'Safwane' });
ok(owner.cookie && /HttpOnly/.test(owner.response.headers.get('set-cookie')) && /Secure/.test(owner.response.headers.get('set-cookie')), 'HttpOnly Secure session cookie');
const snapshot = await (await api(owner.cookie)).json();
eq([snapshot.workspace.role, snapshot.user.email, snapshot.user.name], ['owner', 'safwane@studio.test', 'Safwane'], 'e-mail normalized, name kept');
const stored = (await pg.query('SELECT password_hash, email_verified FROM users WHERE email = $1', ['safwane@studio.test'])).rows[0];
ok(stored.password_hash.startsWith('scrypt$') && !stored.password_hash.includes('correct-horse'), 'password stored hashed');
eq(stored.email_verified, null, 'a typed e-mail is not a verified e-mail');
await post({ action: 'sign-up', email: 'safwane@studio.test', password: 'another-long-password', name: 'Dup' }, { status: 409 });

// Wrong passwords lock the account after 5 attempts; a correct password resets the counter.
for (let i = 0; i < 4; i++) await post({ action: 'sign-in', email: 'safwane@studio.test', password: 'wrong-password-' + i }, { status: 401 });
await post({ action: 'sign-in', email: 'safwane@studio.test', password: 'wrong-password-5' }, { status: 401 });
await post({ action: 'sign-in', email: 'safwane@studio.test', password: 'correct-horse-battery' }, { status: 429 });
await pg.query('UPDATE users SET locked_until = NULL WHERE email = $1', ['safwane@studio.test']);
const again = await post({ action: 'sign-in', email: 'safwane@studio.test', password: 'correct-horse-battery' });
ok(again.cookie && again.cookie !== owner.cookie, 'a fresh session per sign-in');
eq((await pg.query('SELECT failed_logins FROM users WHERE email = $1', ['safwane@studio.test'])).rows[0].failed_logins, 0);
await post({ action: 'sign-in', email: 'nobody@studio.test', password: 'whatever-long-enough' }, { status: 401 });

// Invitations: a password account needs the code; a verified (Google) e-mail claims by address.
const invited = await (await mutate(owner.cookie, { action: 'invite-member', email: 'bob@studio.test', role: 'creative' })).json();
const bob = invited.members.find((m) => m.userId === 'invite:bob@studio.test');
ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(bob.inviteCode), 'owner sees the invitation code');
await post({ action: 'sign-up', email: 'bob@studio.test', password: 'bob-has-a-long-password', name: 'Bob', inviteCode: 'ZZZZ-ZZZZ' }, { status: 400 });
const bobSession = await post({ action: 'sign-up', email: 'bob@studio.test', password: 'bob-has-a-long-password', name: 'Bob', inviteCode: bob.inviteCode.toLowerCase() });
const bobView = await (await api(bobSession.cookie)).json();
eq([bobView.workspace.id, bobView.workspace.role], [snapshot.workspace.id, 'creative'], 'code claimed the invitation into the studio');
ok(!bobView.members.some((m) => m.inviteCode), 'creatives never see invitation codes');
ok(!(await (await api(owner.cookie)).json()).members.some((m) => m.userId === 'invite:bob@studio.test'), 'pending row is gone');

await mutate(owner.cookie, { action: 'invite-member', email: 'carol@client.test', role: 'viewer' });
const carol = await post({ action: 'sign-up', email: 'carol@client.test', password: 'carol-long-password-1', name: 'Carol' });
const carolView = await (await api(carol.cookie)).json();
ok(carolView.workspace.id !== snapshot.workspace.id && carolView.workspace.role === 'owner', 'without the code, a typed e-mail claims nothing');
const codeRow = (await pg.query("SELECT invite_code FROM workspace_members WHERE user_id = 'invite:carol@client.test'")).rows[0];
const carolLater = await post({ action: 'sign-in', email: 'carol@client.test', password: 'carol-long-password-1', inviteCode: codeRow.invite_code });
const carolStudio = await (await api(carolLater.cookie)).json();
eq([carolStudio.workspace.id, carolStudio.workspace.role], [snapshot.workspace.id, 'viewer'], 'the code also works at a later sign-in');

// A Google-created account can never get a password attached from the login form.
await pg.query("INSERT INTO users (id, name, email, email_verified) VALUES ('g1', 'Google Person', 'google@studio.test', now())");
await post({ action: 'sign-up', email: 'google@studio.test', password: 'takeover-attempt-1234', name: 'Attacker' }, { status: 409 });
await post({ action: 'sign-in', email: 'google@studio.test', password: 'takeover-attempt-1234' }, { status: 401 });
eq((await pg.query("SELECT password_hash FROM users WHERE id = 'g1'")).rows[0].password_hash, null);

// Closed studio: with OWNER_EMAIL set, only the owner or an invited address gets in.
globalThis.testEnv.OWNER_EMAIL = 'Contact@The1Core.com';
await post({ action: 'sign-up', email: 'stranger@example.test', password: 'a-perfectly-fine-password', name: 'Stranger' }, { status: 403 });
eq((await pg.query("SELECT count(*)::int AS n FROM users WHERE email = 'stranger@example.test'")).rows[0].n, 0, 'no account row for a refused sign-up');
const studioOwner = await post({ action: 'sign-up', email: 'contact@the1core.com', password: 'the-owner-password-2026', name: 'The One Core' });
const ownerView = await (await api(studioOwner.cookie)).json();
eq(ownerView.workspace.role, 'owner', 'the configured address opens its workspace');
await mutate(studioOwner.cookie, { action: 'invite-member', email: 'dalila@studio.test', role: 'admin' });
const dalilaCode = (await pg.query("SELECT invite_code FROM workspace_members WHERE user_id = 'invite:dalila@studio.test'")).rows[0].invite_code;
await post({ action: 'sign-up', email: 'dalila@studio.test', password: 'dalila-long-password-1', name: 'Dalila' }, { status: 403 });
const dalila = await post({ action: 'sign-up', email: 'dalila@studio.test', password: 'dalila-long-password-1', name: 'Dalila', inviteCode: dalilaCode });
eq((await (await api(dalila.cookie)).json()).workspace.role, 'admin', 'invited address joins with the code');
// An account that exists but has no membership (created before the rule) gets a clear refusal and no workspace.
await pg.query("INSERT INTO users (id, name, email, email_verified) VALUES ('orphan', 'Orphan', 'orphan@example.test', now())");
await pg.query("INSERT INTO sessions (session_token, user_id, expires) VALUES ($1, 'orphan', now() + interval '1 day')", [(await import('node:crypto')).createHash('sha256').update('orphan-token-orphan-token-orphan').digest('hex')]);
const orphan = await api('__Host-the-one.session=orphan-token-orphan-token-orphan');
eq([orphan.status, (await orphan.json()).code], [403, 'no-workspace']);
eq((await pg.query("SELECT count(*)::int AS n FROM workspaces WHERE created_by = 'orphan'")).rows[0].n, 0, 'no workspace created for the orphan');
delete globalThis.testEnv.OWNER_EMAIL;

await pg.close();
console.log(`${checks} password sign-in checks passed: hashing, lockout, invitation codes, Google-account protection, closed-studio access and API sessions.`);
