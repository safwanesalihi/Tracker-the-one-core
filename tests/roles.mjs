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
const owner = { userId: 'owner', fullName: 'Safwane Owner', displayName: 'Safwane Owner', email: 'owner@studio.test' };
const yasmine = { userId: '', fullName: 'Yasmine Creative', displayName: 'Yasmine Creative', email: 'yasmine@studio.test' };
const amine = { userId: '', fullName: 'Amine Creative', displayName: 'Amine Creative', email: 'amine@studio.test' };
const contact = { userId: '', fullName: 'Client Contact', displayName: 'Client Contact', email: 'contact@client.test' };
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
const idOf = (d, email) => d.members.find((m) => m.email === email).userId;
yasmine.userId = idOf(await post({ action: 'invite-member', email: 'yasmine@studio.test', name: 'Yasmine Creative', role: 'creative' }), 'yasmine@studio.test');
amine.userId = idOf(await post({ action: 'invite-member', email: 'amine@studio.test', name: 'Amine Creative', role: 'creative' }), 'amine@studio.test');
contact.userId = idOf(await post({ action: 'invite-member', email: 'contact@client.test', name: 'Client Contact', role: 'client', clientId: c1.id }), 'contact@client.test');
await post({ action: 'invite-member', email: 'x@y.test', role: 'owner' }, 400);
await post({ action: 'invite-member', email: 'owner@studio.test', role: 'creative' }, 400);
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
eq(ids(y, 'task'), [ty1.id, ty2.id, tu.id].sort(), 'tasks assigned to Yasmine plus the unassigned one');
eq(ids(y, 'comment'), [], 'no comments from other people’s tasks');
ok(y.members.every((m) => m.email === null || m.userId === yasmine.userId) && !y.members.some((m) => m.inviteCode), 'roster without e-mails or codes');
ok(!y.members.some((m) => m.userId.startsWith('invite:')), 'pending invitations hidden');

// A member may only act on their own tasks, and always for themselves.
await post({ action: 'update', kind: 'task', id: ta1.id, revision: 1, data: { name: 'Affiche Amine', clientId: c1.id, projectId: p1.id, assignee: 'Amine Creative', status: 'En cours', due: '2026-12-01' } }, 404);
await post({ action: 'comment', taskId: ta1.id, text: 'intrusion' }, 404);
await post({ action: 'comment', taskId: tu.id, text: 'je prends' });
// A member's only edit on a task is the deliverable link — no reassigning or handing off to a teammate.
await post({ action: 'update', kind: 'task', id: ty2.id, revision: 1, data: { name: 'Post Yasmine', clientId: c2.id, projectId: p2.id, assignee: 'Amine Creative', status: 'En cours', due: '2026-12-01' } }, 403);
ok((await get()).records.some((r) => r.id === ty2.id), 'the task stays with Yasmine after the rejected hand-off');
await post({ action: 'create', kind: 'task', data: { name: 'Story créée par Yasmine', clientId: c1.id, projectId: p1.id, assignee: 'Yasmine Creative', status: 'À faire', due: '2026-12-05' } }, 403);
as(owner);
const mine = await t('Story pour Yasmine', c1.id, p1.id, 'Yasmine Creative');
as(yasmine);
ok((await get()).records.some((r) => r.id === mine.id), 'tasks are created by the owner and assigned to members');
await post({ action: 'create', kind: 'client', data: { name: 'Client créé par un membre', quota: '4' } }, 403);
as(owner);
const newClient = await post({ action: 'create', kind: 'client', data: { name: 'Client créé par le propriétaire', quota: '4' } });
as(yasmine);
const newProject = await post({ action: 'create', kind: 'project', data: { name: 'Sous-projet créé par un membre', clientId: newClient.id } });
ok(newProject.records.some((r) => r.id === newProject.id), 'members can still create sub-projects for existing clients');
await post({ action: 'update', kind: 'client', id: newClient.id, revision: 1, data: { name: 'Client créé par un membre', archived: true } }, 403);
// A client's own page (brief, contacts, logo/banner) is studio-owned: a member cannot edit it at all, even without touching archived.
await post({ action: 'update', kind: 'client', id: newClient.id, revision: 1, data: { name: 'Client renommé par un membre' } }, 403);
await post({ action: 'invite-member', email: 'z@z.test', role: 'creative' }, 403);
await post({ action: 'demo' }, 403);
await post({ action: 'request', clientId: c1.id, data: { name: 'Demande' } }, 403);
// Saving a new deliverable link is the only edit a member can make, and it alone sends the task for validation.
const sent = await post({ action: 'update', kind: 'task', id: ty1.id, revision: 1, data: { name: 'Reel Yasmine', clientId: c1.id, projectId: p1.id, assignee: 'Yasmine Creative', status: 'En cours', due: '2026-12-01', deliverable: 'https://x.test/y1-final.mp4' } });
eq(sent.records.find((r) => r.id === ty1.id).status, 'À valider', 'the deliverable link alone moves the task to "À valider"');
ok(sent.records.find((r) => r.id === ty1.id).approvalDueAt, 'a member can send their own work to the client');
await post({ action: 'comment', taskId: ty1.id, text: 'Envoyé !' });
const awaiting = sent.records.find((r) => r.id === ty1.id);
await post({ action: 'update', kind: 'task', id: ty1.id, revision: awaiting.revision, data: { ...awaiting, status: 'Validé' } }, 403);

// Amine sees the mirror image.
as(amine);
const a = await get();
eq(ids(a, 'task'), [ta1.id, tu.id].sort(), 'Amine’s task and the unassigned one; ty2 stayed with Yasmine since the hand-off was rejected');
eq(a.records.filter((r) => r.kind === 'comment').length, 2, 'comments on Amine’s task and on the unassigned task are visible to Amine; Yasmine’s own-task comment is not');

// A member manages the shared library freely, but devis/factures/contrats stay invisible to them.
as(amine);
const lib1 = await post({ action: 'create', kind: 'library', data: { name: 'Prompt accroche Instagram', category: 'prompt', content: 'Écris une accroche…' } });
ok(lib1.records.some((r) => r.id === lib1.id && r.kind === 'library'), 'a member can add a library item and sees it right away');
const libUpdated = await post({ action: 'update', kind: 'library', id: lib1.id, revision: 1, data: { name: 'Prompt accroche Instagram v2', category: 'prompt', content: 'Écris une accroche punchy…' } });
eq(libUpdated.records.find((r) => r.id === lib1.id).name, 'Prompt accroche Instagram v2', 'a member can edit any library item, not just their own');
await post({ action: 'delete', kind: 'library', id: lib1.id, revision: 2 });
ok(!(await get()).records.some((r) => r.id === lib1.id), 'the deleted library item is gone for everyone');
const lib2 = await post({ action: 'create', kind: 'library', data: { name: 'Logo pack', category: 'asset', link: 'https://drive.example.test/logo-pack' } });
ok(lib2.records.some((r) => r.id === lib2.id && r.category === 'asset' && r.link), 'a link-based library item (asset/plugin/preset) needs no file upload');

as(owner);
const devis1 = await post({ action: 'create', kind: 'document', data: { docType: 'devis', clientId: c1.id, lineItems: [{ description: 'Pack contenu', quantity: 1, unitPrice: 5000 }], taxRate: 20 } });
const devisNumber = devis1.records.find((r) => r.id === devis1.id).number;
ok(/^DEVIS-\d{4}-0001$/.test(devisNumber), 'the first devis of the year is numbered 0001');
const devis2 = await post({ action: 'create', kind: 'document', data: { docType: 'devis', clientId: c2.id, lineItems: [] } });
ok(devis2.records.find((r) => r.id === devis2.id).number.endsWith('-0002'), 'the second devis this year gets the next number, regardless of client');
const facture1 = await post({ action: 'create', kind: 'document', data: { docType: 'facture', clientId: c1.id, lineItems: [] } });
ok(facture1.records.find((r) => r.id === facture1.id).number.endsWith('-0001'), 'factures have their own sequence, independent of devis');

// Sending a devis locks its line items — but re-saving it unchanged (e.g. archiving it) must still work:
// line items are stored as jsonb, which does not preserve key order, so a naive JSON.stringify
// comparison would wrongly see a round-tripped-but-identical array as "changed".
const devisSent = await post({ action: 'update', kind: 'document', id: devis1.id, revision: 1, data: {
  docType: 'devis', clientId: c1.id, docStatus: 'sent', lineItems: devis1.records.find((r) => r.id === devis1.id).lineItems, taxRate: 20,
} });
eq(devisSent.records.find((r) => r.id === devis1.id).docStatus, 'sent', 'the devis is now sent');
await post({ action: 'update', kind: 'document', id: devis1.id, revision: 2, data: {
  docType: 'devis', clientId: c1.id, docStatus: 'sent', lineItems: [{ description: 'Autre chose', quantity: 1, unitPrice: 1 }], taxRate: 20,
} }, 409); // a real change to the line items is still rejected once sent
const archived = await post({ action: 'update', kind: 'document', id: devis1.id, revision: 2, data: {
  docType: 'devis', clientId: c1.id, docStatus: 'sent', lineItems: devisSent.records.find((r) => r.id === devis1.id).lineItems, taxRate: 20, archived: true,
} });
ok(archived.records.find((r) => r.id === devis1.id).archived, 'archiving a sent devis with its lines unchanged succeeds');
await post({ action: 'delete', kind: 'document', id: devis1.id, revision: 3 }, 409); // sent (even archived) documents are never hard-deleted

as(amine);
ok(!(await get()).records.some((r) => r.kind === 'document'), 'a member never sees that a devis/facture/contrat exists');
await post({ action: 'create', kind: 'document', data: { docType: 'devis', clientId: c1.id, lineItems: [] } }, 403);

// The client sees their portal only: their client, projects and tasks — nobody else’s.
as(contact);
const c = await get();
eq(c.workspace.role, 'client');
eq(ids(c, 'client'), [c1.id]);
eq(ids(c, 'project'), [p1.id]);
eq(ids(c, 'task'), [ty1.id, ta1.id, tu.id, mine.id].sort(), 'all of Client Un’s tasks, none of Client Deux’s');
ok(!c.records.some((r) => r.id === newClient.id), 'other clients invisible');
ok(c.records.filter((r) => r.kind === 'task').every((r) => !('assignee' in r)), 'assignees hidden from the client');
eq(c.members, []);
eq(ids(c, 'document'), [devis1.id, facture1.id].sort(), 'Client Un sees their own devis and facture, not Client Deux’s devis');
await post({ action: 'approve', taskId: ty1.id });
await post({ action: 'update', kind: 'task', id: ta1.id, revision: 1, data: { name: 'x', clientId: c1.id, projectId: p1.id } }, 403);

as(owner);
eq(ids(await get(), 'task').length, 5, 'the owner sees everything');
eq(ids(await get(), 'client').length, 3, 'only owner-created clients persist');
// Every non-owner role is forbidden from adding clients, including through demo seeding.
for (const role of ['admin', 'viewer', 'client']) {
  await db.query('UPDATE workspace_members SET role = $1, client_id = $2 WHERE workspace_id = $3 AND user_id = $4', [role, role === 'client' ? c1.id : null, WS, amine.userId]);
  as(amine);
  await post({ action: 'create', kind: 'client', data: { name: 'Forbidden client' } }, 403);
  await post({ action: 'demo' }, 403);
  if (role === 'admin') {
    const renamed = await post({ action: 'update', kind: 'client', id: newClient.id, revision: 1, data: { name: 'Client renommé par un admin' } });
    eq(renamed.records.find((r) => r.id === newClient.id).name, 'Client renommé par un admin', 'an admin can edit an existing client’s page');
    ok(!(await get()).records.some((r) => r.kind === 'document'), 'an admin never sees that a devis/facture/contrat exists either');
    await post({ action: 'create', kind: 'document', data: { docType: 'devis', clientId: c1.id, lineItems: [] } }, 403);
  }
  if (role === 'viewer') {
    const viewerView = await get();
    ok(viewerView.records.some((r) => r.kind === 'library'), 'a viewer still reads the library');
    ok(!viewerView.records.some((r) => r.kind === 'document'), 'a viewer never sees devis/factures/contrats either');
    await post({ action: 'create', kind: 'library', data: { name: 'x', category: 'prompt', content: 'y' } }, 403);
  }
}
as(owner);
eq(ids(await get(), 'client').length, 3, 'denied creations and demo calls persist no clients');
// Anyone can rename their own profile; the roster and greeting data follow, e-mail stays.
as(yasmine);
await post({ action: 'update-profile', name: ' ' }, 400);
const renamed = await post({ action: 'update-profile', name: '  Yasmine   Alaoui ' });
eq([renamed.user.name, renamed.user.email], ['Yasmine Alaoui', 'yasmine@studio.test'], 'trimmed name returned with the payload');
as({ ...yasmine, fullName: 'Yasmine Alaoui', displayName: 'Yasmine Alaoui' });
const renamedView = await get();
ok(renamedView.records.some((r) => r.id === ty1.id && r.assignee === 'Yasmine Alaoui'), 'renaming preserves task ownership');
await post({ action: 'update-profile', name: 'Amine Creative' });
as({ ...yasmine, fullName: 'Amine Creative', displayName: 'Amine Creative' });
ok(!(await get()).records.some((r) => r.id === ta1.id), 'matching another member’s display name cannot take their tasks');
await post({ action: 'update-profile', name: 'Yasmine Alaoui' });
as(owner);
eq((await get()).members.find((m) => m.userId === yasmine.userId).name, 'Yasmine Alaoui', 'roster reflects the new name');

await pg.close();
console.log(`${checks} role checks passed: single owner, member scope (clients, own + unassigned tasks, no task creation, read-only team), client portal scope.`);
