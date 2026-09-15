import { strict as assert } from 'node:assert';
import { globSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const esbuildPath = globSync('node_modules/.pnpm/esbuild@*/node_modules/esbuild/lib/main.js')[0] || 'node_modules/esbuild/lib/main.js';
const esbuild = await import(pathToFileURL(esbuildPath));
mkdirSync('.sites-runtime', { recursive: true });
await esbuild.build({
  stdin: {
    contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import Team from './app/team'; export function render(props) { return renderToStaticMarkup(React.createElement(Team, {...props, onChange: async () => {}, onRefresh: () => {}, busy: false})); }`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  outfile: '.sites-runtime/team-test.mjs',
  bundle: true, platform: 'node', format: 'esm',
  external: ['react', 'react/*', 'react-dom/*', 'radix-ui', 'lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
});
const { render } = await import(pathToFileURL(process.cwd() + '/.sites-runtime/team-test.mjs'));
const members = [
  { userId: 'a', role: 'owner', name: 'Ava', email: 'ava@example.test', createdAt: '2026-09-01T12:00:00Z' },
  { userId: 'b', role: 'admin', name: 'Nina', email: 'nina@example.test', createdAt: '2026-09-02T12:00:00Z' },
  { userId: 'c', role: 'creative', name: 'Jules', email: 'jules@example.test', createdAt: '2026-09-03T12:00:00Z' },
  { userId: 'd', role: 'viewer', name: null, email: null, createdAt: '2026-09-04T12:00:00Z' },
];
const base = { members, currentUserId: 'a', workspace: { id: 'workspace-test', name: 'Studio test', role: 'owner' } };
const owner = render(base);
const withPending = render({ ...base, members: members.map((m) => m.userId === 'c' ? { ...m, pending: true } : m) });
assert.match(withPending, /En attente de première connexion/);
assert.match(withPending, /Renvoyer l’invitation à Jules/);
assert.match(withPending, /Inviter une personne/);
assert.doesNotMatch(render({ ...base, members: members.map((m) => ({ ...m, name: '<img src=x onerror=alert(1)>' })) }), /<img src=x/);
assert.match(owner, /Modifier le rôle de Nina/);
assert.match(owner, /Retirer Jules de l’espace/);
assert.doesNotMatch(owner, /Modifier le rôle de Ava|Retirer Ava de l’espace/);
assert.match(owner, /Membre de l’équipe/);
assert.match(owner, /ava@example.test/);
assert.doesNotMatch(owner, /86%|En ligne|Hors ligne|Yasmine|safwane@theone/);
const admin = render({ ...base, currentUserId: 'b', workspace: { ...base.workspace, role: 'admin' } });
assert.match(admin, /Modifier le rôle de Jules/);
assert.doesNotMatch(admin, /Modifier le rôle de Nina|Retirer Nina de l’espace|Retirer Ava de l’espace/);
for (const [role, currentUserId] of [['creative', 'c'], ['viewer', 'd']]) {
  const html = render({ ...base, currentUserId, workspace: { ...base.workspace, role } });
  assert.doesNotMatch(html, /aria-label="Modifier le rôle|aria-label="Retirer/);
  assert.match(html, /ava@example.test/);
}
const disconnected = render({ ...base, workspace: null, members: [] });
assert.match(disconnected, /Connectez votre espace/);
assert.doesNotMatch(disconnected, /ava@example.test|Membres de l’équipe/);
const maliciousName = render({ ...base, members: [{ ...members[0], name: '<script>alert(1)</script>' }] });
assert.doesNotMatch(maliciousName, /<script>alert/);
assert.match(maliciousName, /&lt;script&gt;/);
console.log('Team rendering checks passed: actual profiles, role controls, protected owner/self, read-only roles, disconnected state and escaping.');
