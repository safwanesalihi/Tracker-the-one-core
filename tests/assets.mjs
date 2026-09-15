// Client images: upload by studio roles only, served to workspace members only, replaced images dropped.
import { strict as assert } from 'node:assert';
import { globSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createTestDb, testRuntimePlugin } from './helpers/pg.mjs';

const esbuildPath = globSync('node_modules/.pnpm/esbuild@*/node_modules/esbuild/lib/main.js')[0] || 'node_modules/esbuild/lib/main.js';
const esbuild = await import(pathToFileURL(esbuildPath));
mkdirSync('.sites-runtime/assets-tests', { recursive: true });
await esbuild.build({
  entryPoints: { upload: 'app/api/assets/route.ts', serve: 'app/api/assets/[id]/route.ts', records: 'app/api/records/route.ts' },
  outdir: '.sites-runtime/assets-tests', outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', format: 'esm', external: ['nodemailer'],
  plugins: [testRuntimePlugin({ auth: false })],
});
const { db, pg } = await createTestDb();
globalThis.testDb = db;
globalThis.testEnv = { OWNER_EMAIL: 'owner@studio.test' };
const owner = { userId: 'owner', fullName: 'Owner', displayName: 'Owner', email: 'owner@studio.test' };
const outsider = { userId: 'outsider', fullName: 'Out', displayName: 'Out', email: 'out@else.test' };
globalThis.testUser = owner;
const upload = await import(pathToFileURL(process.cwd() + '/.sites-runtime/assets-tests/upload.mjs'));
const serve = await import(pathToFileURL(process.cwd() + '/.sites-runtime/assets-tests/serve.mjs'));
const records = await import(pathToFileURL(process.cwd() + '/.sites-runtime/assets-tests/records.mjs'));

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const origin = 'https://tracker.test';
const WS = 'ws:owner';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
async function send(kind, file, headers = {}) {
  const body = new FormData(); body.append('kind', kind); if (file) body.append('file', file);
  const r = await upload.POST(new Request(origin + '/api/assets', { method: 'POST', headers: { origin, 'X-Workspace-Id': WS, ...headers }, body }));
  return { status: r.status, data: await r.json() };
}
const get = (id) => serve.GET(new Request(origin + '/api/assets/' + id), { params: Promise.resolve({ id }) });
const mutate = (body) => records.POST(new Request(origin + '/api/records', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'X-Workspace-Id': WS }, body: JSON.stringify(body) }));

await records.GET(new Request(origin + '/api/records'));
const client = await (await mutate({ action: 'create', kind: 'client', data: { name: 'Logo Client' } })).json();

// Upload rules.
eq((await send('logo', new File([png], 'logo.png', { type: 'image/png' }))).status, 200);
eq((await send('poster', new File([png], 'x.png', { type: 'image/png' }))).status, 400, 'unknown kind');
eq((await send('logo', new File([png], 'x.svg', { type: 'image/svg+xml' }))).status, 415, 'svg refused');
eq((await send('logo', new File([new Uint8Array(1_600_000)], 'big.png', { type: 'image/png' }))).status, 413, 'too large');
eq((await send('logo', null)).status, 400, 'no file');
const first = (await send('logo', new File([png], 'logo.png', { type: 'image/png' }))).data.id;
const banner = (await send('banner', new File([png], 'banner.png', { type: 'image/png' }))).data.id;

// Serving: members of the workspace only; immutable caching.
const ok = await get(first);
eq([ok.status, ok.headers.get('content-type'), ok.headers.get('cache-control')], [200, 'image/png', 'private, max-age=31536000, immutable']);
eq(new Uint8Array(await ok.arrayBuffer()), png);
globalThis.testUser = outsider;
eq((await get(first)).status, 404, 'outsiders never see the image');
eq((await send('logo', new File([png], 'x.png', { type: 'image/png' }))).status, 403, 'outsiders cannot upload');
globalThis.testUser = null;
eq((await get(first)).status, 401);
globalThis.testUser = owner;
eq((await get('not-a-uuid')).status, 404);

// Attach to the client, then replace: the previous image is deleted, the new one kept.
const attached = await (await mutate({ action: 'update', kind: 'client', id: client.id, revision: 1, data: { name: 'Logo Client', logo: first, banner } })).json();
eq([attached.records.find((r) => r.id === client.id).logo, attached.records.find((r) => r.id === client.id).banner], [first, banner]);
eq((await mutate({ action: 'update', kind: 'client', id: client.id, revision: 2, data: { name: 'Logo Client', logo: 'nope', banner } })).status, 400, 'asset ids are validated');
const second = (await send('logo', new File([png], 'logo2.png', { type: 'image/png' }))).data.id;
await mutate({ action: 'update', kind: 'client', id: client.id, revision: 2, data: { name: 'Logo Client', logo: second, banner } });
eq((await get(first)).status, 404, 'replaced logo dropped');
eq((await get(second)).status, 200);
eq((await get(banner)).status, 200, 'untouched banner kept');
await mutate({ action: 'update', kind: 'client', id: client.id, revision: 3, data: { name: 'Logo Client', logo: second, banner: '' } });
eq((await get(banner)).status, 404, 'removed banner dropped');
eq((await pg.query('SELECT count(*)::int AS n FROM assets')).rows[0].n, 2, 'only the live logo and the first unattached upload remain');

// Members (creative) cannot touch a client's logo/banner either — that page is studio-owned — but they keep their own picture.
const member = { userId: 'member', fullName: 'Yasmine', displayName: 'Yasmine', email: 'yasmine@studio.test' };
await pg.query("INSERT INTO users (id, name, email, password_hash) VALUES ('member', 'Yasmine', 'yasmine@studio.test', 'x')");
await pg.query("INSERT INTO workspace_members (workspace_id, user_id, role, name, email) VALUES ($1, 'member', 'creative', 'Yasmine', 'yasmine@studio.test')", [WS]);
globalThis.testUser = member;
eq((await send('logo', new File([png], 'x.png', { type: 'image/png' }))).status, 403, 'members cannot upload client images either');
const memberAvatar = (await send('avatar', new File([png], 'me.png', { type: 'image/png' }))).data.id;
eq(typeof memberAvatar, 'string', 'members can still upload their own picture');
globalThis.testUser = owner;

// Profile pictures: any member (a client included) sets their own; replaced pictures are dropped; visible to any signed-in user.
const contact = { userId: 'contact', fullName: 'Amina', displayName: 'Amina', email: 'amina@client.test' };
await pg.query("INSERT INTO users (id, name, email, password_hash) VALUES ('contact', 'Amina', 'amina@client.test', 'x')");
await pg.query("INSERT INTO workspace_members (workspace_id, user_id, role, name, email, client_id) VALUES ($1, 'contact', 'client', 'Amina', 'amina@client.test', $2)", [WS, client.id]);
globalThis.testUser = contact;
eq((await send('logo', new File([png], 'x.png', { type: 'image/png' }))).status, 403, 'clients cannot upload client images');
const avatar1 = (await send('avatar', new File([png], 'me.png', { type: 'image/png' }))).data.id;
eq(typeof avatar1, 'string', 'clients can upload their own picture');
eq((await mutate({ action: 'update-profile', avatar: 'nope' })).status, 400, 'picture id validated');
const withAvatar = await (await mutate({ action: 'update-profile', avatar: avatar1 })).json();
eq(withAvatar.user.avatar, avatar1);
const avatar2 = (await send('avatar', new File([png], 'me2.png', { type: 'image/png' }))).data.id;
await mutate({ action: 'update-profile', avatar: avatar2, name: 'Amina Benali' });
eq((await get(avatar1)).status, 404, 'replaced picture dropped');
globalThis.testUser = outsider;
eq((await get(avatar2)).status, 200, 'pictures are visible to any signed-in user');
globalThis.testUser = owner;
const roster = await (await records.GET(new Request(origin + '/api/records', { headers: { 'X-Workspace-Id': WS } }))).json();
eq([roster.members.find((m) => m.userId === 'contact').avatar, roster.members.find((m) => m.userId === 'contact').name], [avatar2, 'Amina Benali'], 'roster carries the picture and the new name');
globalThis.testUser = contact;
await mutate({ action: 'update-profile', avatar: null });
eq((await get(avatar2)).status, 404, 'removed picture dropped');
globalThis.testUser = owner;

await pg.close();
console.log(`${checks} image checks passed: upload rules, member-only serving, replacement cleanup, profile pictures.`);
