// Role boundaries: one owner, members see clients + their own tasks only, clients see their portal only.
import { strict as assert } from 'node:assert';
import { globSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createTestDb, testRuntimePlugin } from './helpers/pg.mjs';

const esbuildPath = globSync('node_modules/.pnpm/esbuild@*/node_modules/esbuild/lib/main.js')[0] || 'node_modules/esbuild/lib/main.js';
const esbuild = await import(pathToFileURL(esbuildPath));
mkdirSync('.sites-runtime', { recursive: true });
await esbuild.build({ entryPoints: ['app/api/records/route.ts'], outfile: '.sites-runtime/roles-test.mjs', bundle: true, platform: 'node', format: 'esm', plugins: [testRuntimePlugin({ auth: false })] });
const { db, pg } = await createTestDb();
globalThis.testDb = db;
globalThis.testEnv = { OWNER_EMAIL: 'owner@studio.test' };
const owner = { userId: 'owner', fullName: 'Safwane Owner', displayName: 'Safwane Owner', email: 'owner@studio.test', verified: true };
const yasmine = { userId: 'u-yasmine', fullName: 'Yasmine Creative', displayName: 'Yasmine Creative', email: 'yasmine@studio.test', verified: true };
const amine = { userId: 'u-amine', fullName: 'Amine Creative', displayName: 'Amine Creative', email: 'amine@studio.test', verified: true };
const contact = { userId: 'u-contact', fullName: 'Client Contact', displayName: 'Client Contact', email: 'contact@client.test', verified: true };
const { GET, POST } = await import(pathToFileURL(process.cwd() + '/.sites-runtime/roles-test.mjs'));

let checks = 0;
const WS = 'ws:owner';
const as = (user) => { globalThis.testUser = user; };
async function post(body, status = 200) {
  const r = await POST(new Request('https://tracker.test/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://tracker.test', 'X-Workspace-Id': WS }, body: JSON.stringify(body) }));
  const d = await r.json(); assert.equal(r.status, status, JSON.stringify(d)); checks++; return d;
}
async function get(status = 200, workspaceId = WS) {
  const r = await GET(new Request('https://tracker.test/api/records', { headers: workspaceId ? { 'X-Workspace-Id': workspaceId } : {} }));
  const d = await r.json(); assert.equal(r.status, status, JSON.stringify(d)); checks++; return d;
}
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const ids = (d, kind) => d.records.filter((r) => r.kind === kind).map((r) => r.id).sort();

// Owner sets up two clients, projects, and tasks for two members.
as(owner);
await get(200, null);
const c1 = await post({ action: 'create', kind: 'client', data: { name: 'Client Un' } });
const c2 = await post({ action: 'create', kind: 'client', data: { name: 'Client Deux' } });
const p1 = await post({ action: 'create', kind: 'project', data: { name: 'Projet Un', clientId: c1.id } });
const p2 = await post({ action: 'create', kind: 'project', data: { name: 'Projet Deux', clientId: c2.id } });
await post({ action: 'invite-member', email: 'yasmine@studio.test', role: 'creative' });
await post({ action: 'invite-member', email: 'amine@studio.test', role: 'creative' });
await post({ action: 'invite-member', email: 'contact@client.test', role: 'client', clientId: c1.id });
await post({ action: 'invite-member', email: 'x@y.test', role: 'owner' }, 400);
await pg.query("UPDATE workspace_members SET invite_code = NULL WHERE user_id LIKE 'invite:%'"); // codes entered at Google sign-in (covered in tests/auth.mjs)
as(yasmine); await get(200, null); as(amine); await get(200, null); as(contact); await get(200, null); // claim invitations
as(owner);
const t = (name, clientId, projectId, assignee, extra = {}) => post({ action: 'create', kind: 'task', data: { name, clientId, projectId, assignee, status: 'En cours', due: '2026-12-01', ...extra } });
const ty1 = await t('Reel Yasmine', c1.id, p1.id, 'Yasmine Creative', { deliverable: 'https://x.test/y1.mp4' });
const ty2 = await t('Post Yasmine', c2.id, p2.id, 'Yasmine Creative');
const ta1 = await t('Affiche Amine', c1.id, p1.id, 'Amine Creative', { deliverable: 'https://x.test/a1.pdf' });
const tu = await t('Non assignée', c1.id, p1.id, '');
await post({ action: 'comment', taskId: ta1.id, text: 'Note du propriétaire sur la tâche d’Amine.' });

// Only one owner: nobody can be set to owner, the owner cannot be changed.
await post({ action: 'set-member-role', userId: yasmine.userId, expectedRole: 'creative', role: 'owner' }, 400);
await post({ action: 'set-member-role', userId: owner.userId, expectedRole: 'owner', role: 'admin' }, 400);
const ownerView = await get();
eq(ownerView.members.filter((m) => m.role === 'owner').length, 1, 'exactly one owner');

// A member sees every client and project but only their own tasks, comments and events.
as(yasmine);
const y = await get();
eq(y.workspace.role, 'creative');
eq(ids(y, 'client'), [c1.id, c2.id].sort(), 'all clients visible');
eq(ids(y, 'project'), [p1.id, p2.id].sort(), 'all projects visible');
eq(ids(y, 'task'), [ty1.id, ty2.id].sort(), 'only tasks assigned to Yasmine');
eq(ids(y, 'comment'), [], 'no comments from other people’s tasks');
ok(y.members.every((m) => m.email === null || m.userId === yasmine.userId) && !y.members.some((m) => m.inviteCode), 'roster without e-mails or codes');
ok(!y.members.some((m) => m.userId.startsWith('invite:')), 'pending invitations hidden');

// A member may only act on their own tasks, and always for themselves.
await post({ action: 'update', kind: 'task', id: ta1.id, revision: 1, data: { name: 'Affiche Amine', clientId: c1.id, projectId: p1.id, assignee: 'Amine Creative', status: 'En cours', due: '2026-12-01' } }, 404);
await post({ action: 'comment', taskId: ta1.id, text: 'intrusion' }, 404);
await post({ action: 'comment', taskId: tu.id, text: 'unassigned' }, 404);
await post({ action: 'update', kind: 'task', id: ty2.id, revision: 1, data: { name: 'Post Yasmine', clientId: c2.id, projectId: p2.id, assignee: 'Amine Creative', status: 'En cours', due: '2026-12-01' } }, 403);
const mine = await post({ action: 'create', kind: 'task', data: { name: 'Story créée par Yasmine', clientId: c1.id, projectId: p1.id, status: 'À faire', due: '2026-12-05' } });
eq(mine.records.find((r) => r.id === mine.id).assignee, 'Yasmine Creative', 'a member’s new task is assigned to them');
await post({ action: 'create', kind: 'task', data: { name: 'Pour Amine', clientId: c1.id, projectId: p1.id, assignee: 'Amine Creative', status: 'À faire', due: '2026-12-05' } }, 403);
await post({ action: 'create', kind: 'project', data: { name: 'Projet pirate', clientId: c1.id } }, 403);
await post({ action: 'create', kind: 'client', data: { name: 'Client pirate' } }, 403);
await post({ action: 'invite-member', email: 'z@z.test', role: 'creative' }, 403);
await post({ action: 'demo' }, 403);
await post({ action: 'request', clientId: c1.id, data: { name: 'Demande' } }, 403);
const sent = await post({ action: 'update', kind: 'task', id: ty1.id, revision: 1, data: { name: 'Reel Yasmine', clientId: c1.id, projectId: p1.id, assignee: 'Yasmine Creative', status: 'À valider', due: '2026-12-01', deliverable: 'https://x.test/y1.mp4' } });
ok(sent.records.find((r) => r.id === ty1.id).approvalDueAt, 'a member can send their own work to the client');
await post({ action: 'comment', taskId: ty1.id, text: 'Envoyé !' });

// Amine sees the mirror image.
as(amine);
const a = await get();
eq(ids(a, 'task'), [ta1.id], 'only Amine’s task');
eq(a.records.filter((r) => r.kind === 'comment').length, 1, 'the owner’s comment on Amine’s task is visible to Amine');

// The client sees their portal only: their client, projects and tasks — nobody else’s.
as(contact);
const c = await get();
eq(c.workspace.role, 'client');
eq(ids(c, 'client'), [c1.id]);
eq(ids(c, 'project'), [p1.id]);
eq(ids(c, 'task'), [ty1.id, ta1.id, tu.id, mine.id].sort(), 'all of Client Un’s tasks, none of Client Deux’s');
ok(c.records.filter((r) => r.kind === 'task').every((r) => !('assignee' in r)), 'assignees hidden from the client');
eq(c.members, []);
await post({ action: 'approve', taskId: ty1.id });
await post({ action: 'update', kind: 'task', id: ta1.id, revision: 1, data: { name: 'x', clientId: c1.id, projectId: p1.id } }, 403);

as(owner);
eq(ids(await get(), 'task').length, 5, 'the owner sees everything');
await pg.close();
console.log(`${checks} role checks passed: single owner, member scope (clients + own tasks), client portal scope.`);
