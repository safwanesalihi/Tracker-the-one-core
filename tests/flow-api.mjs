// The One Flow through the records API: approve / request-changes / publish / request / invites / client role / lock / sweep.
import { strict as assert } from 'node:assert';
import { globSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createTestDb, testRuntimePlugin } from './helpers/pg.mjs';

const esbuildPath = globSync('node_modules/.pnpm/esbuild@*/node_modules/esbuild/lib/main.js')[0] || 'node_modules/esbuild/lib/main.js';
const esbuild = await import(pathToFileURL(esbuildPath));
mkdirSync('.sites-runtime', { recursive: true });
await esbuild.build({ entryPoints: ['app/api/records/route.ts'], outfile: '.sites-runtime/flow-api-test.mjs', bundle: true, platform: 'node', format: 'esm', plugins: [testRuntimePlugin({ auth: false })] });
const { db, pg } = await createTestDb();
globalThis.testDb = db;
const owner = { userId: 'owner-a', fullName: 'Test Owner', displayName: 'Test Owner', email: 'owner@studio.test' };
const contact = { userId: '', fullName: 'Amina Contact', displayName: 'Amina Contact', email: 'amina@client.test' }; // id assigned by the invitation
const creative = { userId: '', fullName: 'Yasmine', displayName: 'Yasmine', email: 'yasmine@studio.test' };
globalThis.testEnv = { OWNER_EMAIL: 'owner@studio.test' };
globalThis.testUser = owner;
const { GET, POST } = await import(pathToFileURL(process.cwd() + '/.sites-runtime/flow-api-test.mjs'));

let checks = 0;
const WS = 'ws:owner-a';
async function post(body, status = 200, workspaceId = WS) {
  const r = await POST(new Request('https://tracker.test/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://tracker.test', ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}) }, body: JSON.stringify(body) }));
  const d = await r.json(); assert.equal(r.status, status, JSON.stringify(d)); checks++; return d;
}
async function get(status = 200, workspaceId = WS) {
  const r = await GET(new Request('https://tracker.test/api/records', { headers: workspaceId ? { 'X-Workspace-Id': workspaceId } : {} }));
  const d = await r.json(); assert.equal(r.status, status, JSON.stringify(d)); checks++; return d;
}
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const find = (d, id) => d.records.find((r) => r.id === id);
const setData = async (id, patch) => { const row = (await pg.query('SELECT data FROM records WHERE id = $1', [id])).rows[0]; await pg.query('UPDATE records SET data = $1::jsonb WHERE id = $2', [JSON.stringify({ ...row.data, ...patch }), id]); };
const day = (offset) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

// Setup: a client with a quota, a project, a dated task far enough out.
await get(200, null);
const c = await post({ action: 'create', kind: 'client', data: { name: 'Centre Alkhaouarizmi', quota: '8', language: 'العربية' } });
const p = await post({ action: 'create', kind: 'project', data: { name: 'Communication', clientId: c.id } });
const base = { name: 'Reel rentrée', clientId: c.id, projectId: p.id, status: 'En cours', due: day(20), source: 'Interne', deliverable: 'https://drive.test/reel.mp4' };
const t = await post({ action: 'create', kind: 'task', data: base });
ok(t.today && /^\d{4}-\d{2}-\d{2}$/.test(t.today) && Array.isArray(t.workspaces), 'payload carries the studio day and the workspace list');

// J−7 lock: creating inside the window needs an explicit admin override; creatives are refused outright.
const locked = await post({ action: 'create', kind: 'task', data: { ...base, name: 'Urgent', due: day(3) } }, 409);
eq(locked.code, 'lock');
const lifted = await post({ action: 'create', kind: 'task', data: { ...base, name: 'Urgent', due: day(3) }, lockOverride: true });
ok(find(lifted, lifted.id).lockOverride && find(lifted, lifted.id).history.some((h) => h.text.includes('Verrou J−7 levé')), 'override is recorded in history');
await post({ action: 'update', kind: 'task', id: t.id, revision: 1, data: { ...base, due: day(2) } }, 409);
await post({ action: 'update', kind: 'task', id: t.id, revision: 1, data: { ...base, name: 'Reel rentrée (v2)' } });
await post({ action: 'create', kind: 'task', data: { ...base, name: 'Backfill', due: day(-10) } }, 200);

// Sending to the client stores the 48 h deadline.
const sent = await post({ action: 'update', kind: 'task', id: t.id, revision: 2, data: { ...base, status: 'À valider' } });
const sentTask = find(sent, t.id);
ok(sentTask.sentAt && sentTask.approvalDueAt && new Date(sentTask.approvalDueAt) - new Date(sentTask.sentAt) === 48 * 3600 * 1000, '48 h clock stored');

// Invite a client contact: the account exists at once with a temporary password (shown to the studio since no mail is configured).
await post({ action: 'invite-member', email: 'amina@client.test', role: 'client' }, 400);
await post({ action: 'invite-member', email: 'amina@client.test', role: 'client', clientId: 'nope' }, 400);
const invited = await post({ action: 'invite-member', email: 'Amina@Client.test', name: 'Amina Contact', role: 'client', clientId: c.id });
const aminaRow = invited.members.find((m) => m.email === 'amina@client.test');
ok(aminaRow && aminaRow.role === 'client' && aminaRow.clientId === c.id && aminaRow.pending === true, 'member row created, pending first login');
ok(invited.invitation && invited.invitation.sent === false && /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(invited.invitation.temporaryPassword), 'temporary password returned when mail is not configured');
contact.userId = aminaRow.userId;
await post({ action: 'invite-member', email: 'AMINA@client.test', role: 'creative' }, 409);
const invitedCrew = await post({ action: 'invite-member', email: 'yasmine@studio.test', name: 'Yasmine', role: 'creative' });
creative.userId = invitedCrew.members.find((m) => m.email === 'yasmine@studio.test').userId;

globalThis.testUser = contact;
const portal = await get(200, null);
eq([portal.workspace.id, portal.workspace.role, portal.workspace.clientId], [WS, 'client', c.id], 'the contact lands in the studio workspace as a client');
ok(!portal.records.some((r) => r.kind === 'client' && r.id !== c.id), 'only their own client');
ok(portal.records.every((r) => !('assignee' in r) && !('source' in r)), 'internal fields hidden');
eq(portal.members, [], 'no team roster for clients');
const visible = find(portal, t.id);
ok(visible && visible.status === 'À valider' && visible.approvalDueAt, 'the deliverable is visible with its clock');
// Clients cannot do studio things.
await post({ action: 'create', kind: 'task', data: base }, 403);
await post({ action: 'update', kind: 'task', id: t.id, revision: 3, data: base }, 403);
await post({ action: 'publish', taskId: t.id }, 403);
await post({ action: 'invite-member', email: 'x@y.test', role: 'creative' }, 403);
await post({ action: 'demo' }, 403);
await post({ action: 'mark-read', ids: [] }, 403);
// …but can request changes (a counted round) and comment.
const round1 = await post({ action: 'request-changes', taskId: t.id, text: 'Le logo est trop petit.' });
const afterRound = find(round1, t.id);
eq([afterRound.status, afterRound.revisionRound, afterRound.approvalDueAt], ['En cours', 1, undefined], 'round 1 counted, clock stopped');
ok(round1.records.some((r) => r.kind === 'comment' && r.taskId === t.id && r.name.startsWith('[Retours client — tour 1]')), 'feedback lands in the single channel');
await post({ action: 'request-changes', taskId: t.id, text: 'again' }, 409);
await post({ action: 'approve', taskId: t.id }, 409);
// A request through the form creates a task the studio must triage.
const req = await post({ action: 'request', data: { name: 'Story Aïd', due: day(30), channel: 'Instagram', description: 'Visuel + texte' } });
const requested = find(req, req.id);
eq([requested.status, requested.clientId, requested.projectId, requested.request.email, 'source' in requested], ['À faire', c.id, p.id, 'amina@client.test', false], 'request created; internal source hidden from the client');
await post({ action: 'request', data: { name: '', due: day(30) } }, 400);
await post({ action: 'request', data: { name: 'x', projectId: 'other' } }, 400);

// Studio resends, the client approves explicitly: sign-off receipt written.
globalThis.testUser = owner;
const owned = await get();
ok(owned.records.some((r) => r.kind === 'event' && r.type === 'request' && r.taskId === req.id), 'the studio sees the request event');
eq(find(owned, req.id).source, 'Portail', 'source recorded for the studio');
ok(owned.members.find((m) => m.userId === contact.userId && m.role === 'client' && m.clientId === c.id && m.email === contact.email), 'the contact is a member');
const resent = await post({ action: 'update', kind: 'task', id: t.id, revision: find(owned, t.id).revision, data: { ...base, status: 'À valider' } });
globalThis.testUser = contact;
const approved = await post({ action: 'approve', taskId: t.id });
const signed = find(approved, t.id);
eq([signed.status, signed.signOff.mode, signed.signOff.by, signed.signOff.email, signed.signOff.round], ['Validé', 'explicit', 'Amina Contact', 'amina@client.test', 1]);
await post({ action: 'approve', taskId: t.id }, 409);

// Publish (studio only, validated only), then evergreen rules.
globalThis.testUser = owner;
await post({ action: 'publish', taskId: lifted.id }, 409);
const published = await post({ action: 'publish', taskId: t.id, day: day(20) });
ok(find(published, t.id).publishedAt.startsWith(day(20)), 'published on the given day');
await post({ action: 'publish', taskId: t.id }, 409);
await post({ action: 'create', kind: 'task', data: { ...base, name: 'Reserve', due: day(40), evergreen: true } }, 400);
const reserve = await post({ action: 'create', kind: 'task', data: { ...base, name: 'Reserve', due: '', status: 'Validé', evergreen: true } });
ok(find(reserve, reserve.id).evergreen && find(reserve, reserve.id).signOff.mode === 'studio', 'studio validation writes a studio receipt');
const scheduled = await post({ action: 'update', kind: 'task', id: reserve.id, revision: 1, data: { ...base, name: 'Reserve', due: day(30), status: 'Validé' } });
ok(find(scheduled, reserve.id).evergreen === false && find(scheduled, reserve.id).history.some((h) => h.text.startsWith('Sorti de la réserve')), 'dating a reserve item takes it out of the reserve');

// The sweep: an expired clock is applied on the next read, once, with an event; stale revisions are rejected afterwards.
const expiring = await post({ action: 'create', kind: 'task', data: { ...base, name: 'Silence', due: day(25), status: 'À valider' } });
await setData(expiring.id, { approvalDueAt: new Date(Date.now() - 60000).toISOString(), sentAt: new Date(Date.now() - 49 * 3600 * 1000).toISOString() });
const swept = await get();
const auto = find(swept, expiring.id);
eq([auto.status, auto.signOff.mode, auto.revision], ['Validé', 'silence', 2], 'silence approved, revision bumped');
ok(swept.records.some((r) => r.kind === 'event' && r.type === 'auto-approved' && r.taskId === expiring.id), 'auto-approval event written');
eq(swept.records.filter((r) => r.kind === 'event' && r.type === 'auto-approved' && r.taskId === expiring.id).length, 1);
await post({ action: 'update', kind: 'task', id: expiring.id, revision: 1, data: { ...base, name: 'Silence', due: day(25), status: 'En cours' } }, 409);
const again = await get();
eq(again.records.filter((r) => r.kind === 'event' && r.taskId === expiring.id).length, 1, 'idempotent');
// Reminder bookkeeping does not bump revisions.
const reminding = await post({ action: 'create', kind: 'task', data: { ...base, name: 'Reminder', due: day(25), status: 'À valider' } });
await setData(reminding.id, { approvalDueAt: new Date(Date.now() + 20 * 3600 * 1000).toISOString() });
const reminded = find(await get(), reminding.id);
eq([reminded.reminders, reminded.revision], [['24h'], 1], 'reminder recorded without invalidating open editors');
ok(swept.records.some((r) => r.kind === 'event' && r.type === 'reminder') || (await get()).records.some((r) => r.kind === 'event' && r.type === 'reminder'), 'reminder event exists');
// Mark-read flips events for the studio.
const unreadIds = (await get()).records.filter((r) => r.kind === 'event' && !r.read).map((r) => r.id);
const read = await post({ action: 'mark-read', ids: unreadIds });
ok(read.records.filter((r) => r.kind === 'event').every((r) => r.read), 'all events read');

// Creative invite claims into the studio; creatives cannot lift the lock or invite.
globalThis.testUser = creative;
const crew = await get(200, null);
eq([crew.workspace.id, crew.workspace.role], [WS, 'creative']);
await post({ action: 'create', kind: 'task', data: { ...base, name: 'Rush', due: day(2) } }, 403);
await post({ action: 'create', kind: 'task', data: { ...base, name: 'Rush', due: day(2) }, lockOverride: true }, 403);
await post({ action: 'invite-member', email: 'z@z.test', role: 'creative' }, 403);

// Removing the client's access ends the portal; nobody but the owner ever gets a workspace of their own.
globalThis.testUser = owner;
await post({ action: 'set-member-role', userId: contact.userId, expectedRole: 'client', role: 'client', clientId: 'missing' }, 400);
await post({ action: 'remove-member', userId: contact.userId, expectedRole: 'client' });
globalThis.testUser = contact;
await get(403, WS);
const fallback = await get(403, null);
eq(fallback.code, 'no-workspace', 'no workspace is created for a revoked account');

console.log(`${checks} flow API checks passed: J−7 lock, 48 h clock, invitations, client portal scope, rounds, receipts, publish, evergreen, sweep idempotence and revocation.`);
