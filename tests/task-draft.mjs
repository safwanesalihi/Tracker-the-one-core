import { strict as assert } from 'node:assert';
import { globSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const esbuildPath = globSync('node_modules/.pnpm/esbuild@*/node_modules/esbuild/lib/main.js')[0] || 'node_modules/esbuild/lib/main.js';
const esbuild = await import(pathToFileURL(esbuildPath));
mkdirSync('.sites-runtime', { recursive: true });
await esbuild.build({
  stdin: {
    contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import Row, {TaskDraftActions} from './app/task-draft-row'; export {emptyTaskDraft, editTaskDraft, taskDraftError} from './lib/task-draft'; export {googleProfileImage} from './lib/profile'; export function render(props) { return renderToStaticMarkup(<><table><tbody><Row {...props}/></tbody></table><TaskDraftActions {...props}/></>); }`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  outfile: '.sites-runtime/task-draft-test.mjs', bundle: true, platform: 'node', format: 'esm',
  external: ['react', 'react/*', 'react-dom/*', 'radix-ui', 'lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
});
const { emptyTaskDraft, editTaskDraft, taskDraftError, googleProfileImage, render } = await import(pathToFileURL(process.cwd() + '/.sites-runtime/task-draft-test.mjs'));
const empty = emptyTaskDraft();
for (const [key, value] of Object.entries(empty)) assert.equal(value, key === 'status' ? 'À faire' : '');
assert.equal(emptyTaskDraft({ date: '2026-09-15', status: 'En cours', clientId: 'c' }).due, '2026-09-15');
const clients = [{ id: 'c', kind: 'client', name: 'Client' }];
const projects = [{ id: 'p', kind: 'project', clientId: 'c', name: 'Projet' }];
assert.ok(taskDraftError(empty, clients, projects));
let filled = { ...empty, name: 'Nouvelle tâche', clientId: 'c', projectId: 'p' };
assert.equal(taskDraftError(filled, clients, projects), '');
assert.ok(taskDraftError(filled, clients, [{ ...projects[0], archived: true }]));
assert.ok(taskDraftError(filled, clients, [{ ...projects[0], clientId: 'different' }]));
assert.equal(editTaskDraft(filled, 'clientId', 'other').projectId, '');
assert.equal(filled.projectId, 'p', 'Draft edits must not mutate an earlier draft');
const props = { draft: empty, clients: [], projects: [], busy: false, error: '', onChange() {}, onSave() {}, onCancel() {} };
const html = render(props);
assert.match(html, /Nouvelle tâche à remplir/);
assert.match(html, /form="task-draft-form"/);
assert.match(html, /<form id="task-draft-form"/);
assert.doesNotMatch(html, /role="dialog"/);
assert.ok(html.indexOf('</table>') < html.indexOf('<form'), 'Save and errors must remain outside horizontal table scrolling');
const failed = render({ ...props, draft: filled, error: 'Service indisponible. Réessayez.' });
assert.match(failed, /value="Nouvelle tâche"/);
assert.match(failed, /Service indisponible/);
assert.match(failed, /role="alert"/);
assert.match(render({ ...props, busy: true }), /disabled=""/);
assert.equal(googleProfileImage('https://lh3.googleusercontent.com/photo'), 'https://lh3.googleusercontent.com/photo');
for (const url of ['javascript:alert(1)', 'http://lh3.googleusercontent.com/photo', 'https://lh3.googleusercontent.com.evil.test/photo', 'https://user:pass@lh3.googleusercontent.com/photo']) assert.equal(googleProfileImage(url), null);
console.log('Inline task checks passed: empty row, context, parent validation, form association, visible errors, draft retention and safe profile images.');
