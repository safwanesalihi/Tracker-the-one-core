// Sign-in by e-mail + password only: owner seeding, invitations with a temporary password, forced change,
// lockout, sign-out, and the API gate while a temporary password is in force.
import { strict as assert } from 'node:assert';
import { globSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createTestDb, testRuntimePlugin } from './helpers/pg.mjs';

const esbuildPath = globSync('node_modules/.pnpm/esbuild@*/node_modules/esbuild/lib/main.js')[0] || 'node_modules/esbuild/lib/main.js';
const esbuild = await import(pathToFileURL(esbuildPath));
mkdirSync('.sites-runtime/signin-tests', { recursive: true });
await esbuild.build({
  entryPoints: { password: 'app/api/auth/password/route.ts', signout: 'app/api/auth/signout/route.ts', records: 'app/api/records/route.ts', status: 'app/api/auth/status/route.ts', mail: 'lib/mail.ts' },
  outdir: '.sites-runtime/signin-tests', outExtension: { '.js': '.mjs' },
  bundle: true, platform: 'node', format: 'esm', external: ['nodemailer'],
  plugins: [testRuntimePlugin({ auth: true })],
});
const { db, pg } = await createTestDb();
globalThis.testDb = db;
const origin = 'https://tracker.test';
globalThis.testEnv = { AUTH_URL: origin, OWNER_EMAIL: 'Contact@The1Core.com', OWNER_PASSWORD: 'TOC-owner-test-password' };
const password = await import(pathToFileURL(process.cwd() + '/.sites-runtime/signin-tests/password.mjs'));
const signout = await import(pathToFileURL(process.cwd() + '/.sites-runtime/signin-tests/signout.mjs'));
const records = await import(pathToFileURL(process.cwd() + '/.sites-runtime/signin-tests/records.mjs'));
const status = await import(pathToFileURL(process.cwd() + '/.sites-runtime/signin-tests/status.mjs'));
const mail = await import(pathToFileURL(process.cwd() + '/.sites-runtime/signin-tests/mail.mjs'));

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const cookieOf = (response) => response.headers.getSetCookie().find((c) => c.startsWith('__Host-the-one.session='))?.split(';')[0] ?? null;

async function post(body, { status: expected = 200, headers = {}, cookie = '' } = {}) {
  const response = await password.POST(new Request(origin + '/api/auth/password', { method: 'POST', headers: { 'content-type': 'application/json', origin, cookie, ...headers }, body: JSON.stringify(body) }));
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data)); checks++;
  return { data, cookie: cookieOf(response), response };
}
const api = (cookie, extra = {}) => records.GET(new Request(origin + '/api/records', { headers: { cookie, ...extra } }));
const mutate = (cookie, body) => records.POST(new Request(origin + '/api/records', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));

eq((await status.GET().json()), { passwordConfigured: true, mailConfigured: false });

// Nobody can sign up; unknown addresses and wrong owner passwords are simply refused.
await post({ action: 'sign-up', email: 'x@y.test', password: 'whatever-long-enough', name: 'X' }, { status: 400 });
await post({ action: 'sign-in', email: 'stranger@example.test', password: 'whatever-long-enough' }, { status: 401 });
await post({ action: 'sign-in', email: 'contact@the1core.com', password: 'not-the-owner-password' }, { status: 401 });
eq((await pg.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 0, 'no rows written by refused attempts');
await post({ action: 'sign-in', email: 'contact@the1core.com', password: 'TOC-owner-test-password' }, { status: 403, headers: { origin: 'https://evil.test' } });
// Same-origin is what matters: the *.vercel.app address works alongside the custom domain, plain http elsewhere does not.
await post({ action: 'sign-in', email: 'contact@the1core.com', password: 'wrong-on-purpose' }, { status: 401, headers: { origin: 'https://the-one-tracker.vercel.app', host: 'the-one-tracker.vercel.app', 'x-forwarded-proto': 'https' } });
await post({ action: 'sign-in', email: 'contact@the1core.com', password: 'TOC-owner-test-password' }, { status: 403, headers: { origin: 'http://tracker.the1core.com', host: 'tracker.the1core.com', 'x-forwarded-proto': 'http' } });

// The owner is seeded from the environment on first sign-in and owns the studio.
const owner = await post({ action: 'sign-in', email: 'CONTACT@the1core.com', password: 'TOC-owner-test-password' });
ok(owner.cookie && /HttpOnly/.test(owner.response.headers.get('set-cookie')) && /Secure/.test(owner.response.headers.get('set-cookie')), 'HttpOnly Secure session cookie');
eq(owner.data.mustChangePassword, false);
const studio = await (await api(owner.cookie)).json();
eq([studio.workspace.role, studio.user.email, studio.mailConfigured], ['owner', 'contact@the1core.com', false]);
const stored = (await pg.query("SELECT password_hash FROM users WHERE email = 'contact@the1core.com'")).rows[0];
ok(stored.password_hash.startsWith('scrypt$') && !stored.password_hash.includes('TOC-owner'), 'owner password stored hashed');

// A migrated (Google-era) owner row marked 'reset' is re-armed with the configured password, keeping its id.
await pg.query("UPDATE users SET password_hash = 'reset' WHERE email = 'contact@the1core.com'");
await post({ action: 'sign-in', email: 'contact@the1core.com', password: 'wrong' }, { status: 401 });
const rearmed = await post({ action: 'sign-in', email: 'contact@the1core.com', password: 'TOC-owner-test-password' });
eq((await (await api(rearmed.cookie)).json()).workspace.id, studio.workspace.id, 'same workspace after re-arming');

// Invitation: the account exists at once, with a temporary password shown to the studio (mail not configured).
const invited = await (await mutate(owner.cookie, { action: 'invite-member', email: 'Yasmine@Studio.test', name: 'Yasmine', role: 'creative' })).json();
const temp = invited.invitation.temporaryPassword;
ok(invited.invitation.sent === false && /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(temp), 'temporary password returned to the studio');
const yasmineRow = invited.members.find((m) => m.email === 'yasmine@studio.test');
eq([yasmineRow.role, yasmineRow.pending], ['creative', true]);
const message = mail.invitationMessage({ to: 'yasmine@studio.test', name: 'Yasmine', temporaryPassword: temp, studio: 'The One Core', url: origin, roleLabel: 'Membre', renewal: false });
ok(message.subject.includes('The One Core') && message.text.includes(temp) && message.html.includes(temp) && message.text.includes(origin), 'invitation e-mail carries url, login and temporary password');

// First login with the temporary password: session issued, but the app is gated until the password is changed.
const first = await post({ action: 'sign-in', email: 'yasmine@studio.test', password: temp });
eq(first.data.mustChangePassword, true);
const gated = await api(first.cookie);
eq([gated.status, (await gated.json()).code], [403, 'password-change-required']);
eq((await mutate(first.cookie, { action: 'comment', taskId: 'x', text: 'hi' })).status, 403, 'writes are gated too');
await post({ action: 'change-password', currentPassword: 'wrong', newPassword: 'yasmine-chooses-this-one' }, { status: 401, cookie: first.cookie });
await post({ action: 'change-password', currentPassword: temp, newPassword: 'short' }, { status: 400, cookie: first.cookie });
await post({ action: 'change-password', currentPassword: temp, newPassword: temp }, { status: 400, cookie: first.cookie });
await post({ action: 'change-password', currentPassword: temp, newPassword: 'yasmine-chooses-this-one' }, { status: 401, cookie: '' });
await post({ action: 'change-password', currentPassword: temp, newPassword: 'yasmine-chooses-this-one' }, { cookie: first.cookie });
const inside = await (await api(first.cookie)).json();
eq([inside.workspace.id, inside.workspace.role], [studio.workspace.id, 'creative'], 'after the change, the member is in the studio');
await post({ action: 'sign-in', email: 'yasmine@studio.test', password: temp }, { status: 401 });
const second = await post({ action: 'sign-in', email: 'yasmine@studio.test', password: 'yasmine-chooses-this-one' });
eq(second.data.mustChangePassword, false);
ok(!(await (await api(owner.cookie)).json()).members.find((m) => m.email === 'yasmine@studio.test').pending, 'no longer pending');

// Renewing an invitation (forgotten password): new temporary password, old one and sessions dead.
const renewed = await (await mutate(owner.cookie, { action: 'renew-invitation', userId: yasmineRow.userId })).json();
const temp2 = renewed.invitation.temporaryPassword;
ok(temp2 && temp2 !== temp);
eq((await api(second.cookie)).status, 401, 'previous sessions closed');
await post({ action: 'sign-in', email: 'yasmine@studio.test', password: 'yasmine-chooses-this-one' }, { status: 401 });
const again = await post({ action: 'sign-in', email: 'yasmine@studio.test', password: temp2 });
eq(again.data.mustChangePassword, true);
await post({ action: 'change-password', currentPassword: temp2, newPassword: 'yasmine-second-password' }, { cookie: again.cookie });
await mutate(owner.cookie, { action: 'renew-invitation', userId: 'nobody' }).then((r) => { assert.equal(r.status, 404); checks++; });
await mutate(second.cookie, { action: 'renew-invitation', userId: yasmineRow.userId }).then((r) => { assert.equal(r.status, 401); checks++; });

// Members cannot invite; a client invitation scopes the account to its client.
const c = await (await mutate(owner.cookie, { action: 'create', kind: 'client', data: { name: 'Client Test' } })).json();
const clientInvite = await (await mutate(owner.cookie, { action: 'invite-member', email: 'amina@client.test', name: 'Amina', role: 'client', clientId: c.id })).json();
const amina = await post({ action: 'sign-in', email: 'amina@client.test', password: clientInvite.invitation.temporaryPassword });
await post({ action: 'change-password', currentPassword: clientInvite.invitation.temporaryPassword, newPassword: 'amina-portal-password' }, { cookie: amina.cookie });
const portal = await (await api(amina.cookie)).json();
eq([portal.workspace.role, portal.workspace.clientId, portal.records.filter((r) => r.kind === 'client').length], ['client', c.id, 1]);
eq((await mutate(again.cookie, { action: 'invite-member', email: 'z@z.test', role: 'creative' })).status, 403);
eq((await mutate(owner.cookie, { action: 'invite-member', email: 'contact@the1core.com', role: 'creative' })).status, 400, 'the owner cannot be invited');
eq((await mutate(owner.cookie, { action: 'invite-member', email: 'amina@client.test', role: 'creative' })).status, 409, 'already a member');

// Lockout after 5 wrong passwords; a correct one afterwards resets the counter.
for (let i = 0; i < 5; i++) await post({ action: 'sign-in', email: 'amina@client.test', password: 'wrong-' + i }, { status: 401 });
await post({ action: 'sign-in', email: 'amina@client.test', password: 'amina-portal-password' }, { status: 429 });
await pg.query("UPDATE users SET locked_until = NULL WHERE email = 'amina@client.test'");
await post({ action: 'sign-in', email: 'amina@client.test', password: 'amina-portal-password' });
eq((await pg.query("SELECT failed_logins FROM users WHERE email = 'amina@client.test'")).rows[0].failed_logins, 0);

// Sign-out deletes the session; the cookie alone opens nothing afterwards.
const out = await signout.POST(new Request(origin + '/api/auth/signout', { method: 'POST', headers: { origin, cookie: amina.cookie, 'content-type': 'application/json' }, body: '{}' }));
eq(out.status, 200);
ok(/Max-Age=0/.test(out.headers.get('set-cookie') ?? ''), 'cookie cleared');
eq((await api(amina.cookie)).status, 401);
eq((await signout.POST(new Request(origin + '/api/auth/signout', { method: 'POST', headers: { origin: 'https://evil.test', cookie: owner.cookie } }))).status, 403);

// Unknown session tokens, malformed cookies and an expired session are all refused.
eq((await api('__Host-the-one.session=' + 'a'.repeat(64))).status, 401);
eq((await api(`${owner.cookie}; ${owner.cookie}`)).status, 401, 'duplicate cookies are refused');
await pg.query("UPDATE sessions SET expires = now() - interval '1 minute'");
eq((await api(owner.cookie)).status, 401, 'expired session');

await pg.close();
console.log(`${checks} sign-in checks passed: owner seeding, invitations with temporary passwords, forced change, renewal, client scope, lockout, sign-out and session hygiene.`);
