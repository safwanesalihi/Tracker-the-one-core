// The One Flow rules, exercised without a database.
import { strict as assert } from 'node:assert';
import { globSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const esbuildPath = globSync('node_modules/.pnpm/esbuild@*/node_modules/esbuild/lib/main.js')[0] || 'node_modules/esbuild/lib/main.js';
const esbuild = await import(pathToFileURL(esbuildPath));
mkdirSync('.sites-runtime', { recursive: true });
await esbuild.build({ entryPoints: ['lib/flow.ts'], outfile: '.sites-runtime/flow-test.mjs', bundle: true, platform: 'node', format: 'esm',
  plugins: [{ name: 'alias', setup(b) { b.onResolve({ filter: /^@\/lib\/model$/ }, () => ({ path: process.cwd() + '/lib/model.ts' })); } }] });
const flowLib = await import(pathToFileURL(process.cwd() + '/.sites-runtime/flow-test.mjs'));
const { flow, courtOf, gatesFor, insideLock, lockApplies, sendForValidation, approve, requestChanges, publish, sweep, computeMetrics, monthPeriod, portalView, shiftDay, dayIn, isEvergreenReserve } = flowLib;

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };

const today = '2026-09-14';
const at = (iso) => new Date(iso);
const task = (extra = {}) => ({ id: 't1', kind: 'task', revision: 1, name: 'Post', clientId: 'c1', projectId: 'p1', status: 'À faire', createdAt: '2026-09-01T09:00:00.000Z', ...extra });
const client = { id: 'c1', kind: 'client', revision: 1, name: 'Client', createdAt: '2026-09-01T09:00:00.000Z', quota: '4' };
const project = { id: 'p1', kind: 'project', revision: 1, name: 'Projet', clientId: 'c1', createdAt: '2026-09-01T09:00:00.000Z' };

// Court is derived, never typed.
eq(courtOf(task()), 'studio'); eq(courtOf(task({ status: 'À valider' })), 'client'); eq(courtOf(task({ status: 'Validé' })), 'studio');
eq(courtOf(task({ status: 'Validé', publishedAt: '2026-09-10T10:00:00.000Z' })), 'done'); eq(courtOf(task({ archived: true })), 'done');

// Four backward gates from the publish date.
const gates = gatesFor(task({ due: '2026-09-28', description: 'brief' }), today);
eq(gates.map((g) => g.day), ['2026-09-14', '2026-09-21', '2026-09-23', '2026-09-27']);
eq(gates.map((g) => g.reached), [true, false, false, false]);
ok(!gates.some((g) => g.late), 'nothing late two weeks out');
const late = gatesFor(task({ due: '2026-09-16', status: 'En cours' }), today);
ok(late.find((g) => g.key === 'send').late && late.find((g) => g.key === 'validation').late, 'send and validation gates are late two days before publishing');
eq(gatesFor(task(), today), [], 'no due, no gates');
eq(gatesFor(task({ due: '2026-09-28', publishable: false }), today), [], 'internal work has no gates');
ok(!isEvergreenReserve(task({ status: 'Validé', evergreen: true, publishable: false })), 'internal work is never evergreen reserve');
{
  const internal = sweep([client, project, task({ id: 'copy', status: 'En cours', due: shiftDay(dayIn(new Date('2026-09-16T11:00:00.000Z')), 1), publishable: false })], new Date('2026-09-16T11:00:00.000Z'));
  eq(internal.events, [], 'no J−1 / J−7 alerts for internal work');
}

// J−7 lock: only future dates inside the window, only when the date actually moves.
ok(insideLock('2026-09-20', today) && insideLock(today, today) && !insideLock('2026-09-21', today), 'window is today … J−7 exclusive');
ok(!insideLock('2026-09-10', today), 'past dates are backfills, not lock violations');
ok(lockApplies(undefined, '2026-09-18', today), 'creating inside the window is locked');
ok(!lockApplies('2026-09-18', '2026-09-18', today), 'keeping the same date is free');
ok(lockApplies('2026-09-30', '2026-09-18', today) && !lockApplies('2026-09-18', '2026-09-30', today), 'moving in is locked, moving out is free');

// Clock, rounds, sign-off.
const sent = sendForValidation(task({ status: 'En cours', deliverable: 'https://x.test/a.pdf' }), '2026-09-14T10:00:00.000Z');
eq(sent.status, 'À valider'); eq(sent.approvalDueAt, '2026-09-16T10:00:00.000Z', '48 h clock stored, never recomputed');
const round1 = requestChanges(sent, 'Client A', '2026-09-15T10:00:00.000Z');
eq([round1.status, round1.revisionRound, round1.approvalDueAt], ['En cours', 1, undefined]);
const round3 = requestChanges(requestChanges(round1, 'Client A', '2026-09-16T10:00:00.000Z'), 'Client A', '2026-09-17T10:00:00.000Z');
ok(round3.revisionRound === 3 && round3.history.at(-1).text.includes('hors forfait'), 'round 3 is flagged hors forfait');
const signed = approve(sent, { mode: 'explicit', by: 'Client A', email: 'a@client.test', at: '2026-09-15T08:00:00.000Z', round: 0 });
eq([signed.status, signed.validatedAt, signed.signOff.mode, signed.approvalDueAt], ['Validé', '2026-09-15T08:00:00.000Z', 'explicit', undefined]);
const live = publish(signed, '2026-09-20T09:00:00.000Z', 'Studio');
eq(courtOf(live), 'done');
ok(isEvergreenReserve(task({ status: 'Validé', evergreen: true })) && !isEvergreenReserve(task({ status: 'Validé', evergreen: true, due: '2026-10-01' })), 'reserve = validated, undated, unpublished');

// The sweep: silence approves, reminders fire once, J−1 and J−7 alert, all idempotent.
const now = at('2026-09-16T11:00:00.000Z');
const records = [client, project,
  task({ id: 'due', status: 'À valider', sentAt: '2026-09-14T10:00:00.000Z', approvalDueAt: '2026-09-16T10:00:00.000Z', deliverable: 'https://x.test/a.pdf' }),
  task({ id: 'soon', status: 'À valider', sentAt: '2026-09-15T08:00:00.000Z', approvalDueAt: '2026-09-17T08:00:00.000Z', deliverable: 'https://x.test/b.pdf' }),
  task({ id: 'tomorrow', status: 'En cours', due: shiftDay(dayIn(now), 1) }),
  task({ id: 'locked', status: 'À faire', due: shiftDay(dayIn(now), 4) }),
  task({ id: 'fine', status: 'À faire', due: shiftDay(dayIn(now), 20) }),
  task({ id: 'archived', status: 'À valider', approvalDueAt: '2026-09-10T10:00:00.000Z', archived: true }),
];
const first = sweep(records, now);
const auto = first.tasks.find((t) => t.id === 'due');
eq([auto.status, auto.signOff.mode, auto.validatedAt], ['Validé', 'silence', '2026-09-16T10:00:00.000Z'], 'silence approves at the stored deadline');
const remindedSoon = first.tasks.find((t) => t.id === 'soon');
eq(remindedSoon.reminders, ['24h'], 'the 24 h reminder fires once, 6 h not yet');
ok(!first.tasks.some((t) => t.id === 'archived'), 'archived items are left alone');
eq(first.events.map((e) => e.type).sort(), ['auto-approved', 'lock', 'lock', 'reminder', 'sweep'], 'tomorrow is both a J−1 miss and inside the J−7 window');
ok(first.events.find((e) => e.type === 'sweep').taskId === 'tomorrow' && first.events.filter((e) => e.type === 'lock').map((e) => e.taskId).sort().join() === 'locked,tomorrow');
const applied = records.map((r) => first.tasks.find((t) => t.id === r.id) ?? r);
const second = sweep(applied, now);
eq([second.tasks.length, second.events.filter((e) => e.type !== 'sweep' && e.type !== 'lock').length], [0, 0], 'running again changes nothing');
eq(second.events.map((e) => e.id), first.events.filter((e) => e.type === 'sweep' || e.type === 'lock').map((e) => e.id), 'alert ids are deterministic so INSERT OR IGNORE dedupes them');

// The six numbers.
const period = monthPeriod('2026-09-14');
eq(period, { from: '2026-09-01', to: '2026-09-30' });
const done = (id, extra) => task({ id, status: 'Validé', sentAt: '2026-09-02T10:00:00.000Z', deliverable: 'https://x.test', ...extra });
const metricRecords = [client, project,
  done('a', { due: '2026-09-05', signOff: { mode: 'explicit', by: 'A', at: '2026-09-02T20:00:00.000Z', round: 1 }, revisionRound: 1, publishedAt: '2026-09-05T09:00:00.000Z' }),
  done('b', { due: '2026-09-06', signOff: { mode: 'silence', by: 'Validation tacite', at: '2026-09-04T10:00:00.000Z', round: 0 }, revisionRound: 0, publishedAt: '2026-09-07T09:00:00.000Z' }),
  done('c', { due: '2026-09-08', signOff: { mode: 'explicit', by: 'A', at: '2026-09-03T10:00:00.000Z', round: 2 }, revisionRound: 2, publishedAt: '2026-09-08T09:00:00.000Z' }),
  done('e1', { evergreen: true }), done('e2', { evergreen: true }),
  task({ id: 'old', status: 'Validé', signOff: { mode: 'explicit', by: 'A', at: '2026-08-20T10:00:00.000Z', round: 0 }, publishedAt: '2026-08-21T09:00:00.000Z' }),
];
const m = computeMetrics(metricRecords, period);
eq([m.published, m.onTime, Math.round(m.onTimeRate * 100)], [3, 2, 67], 'b went out a day late');
eq(m.medianValidationHours, 17, 'median of 10 h and 24 h explicit decisions');
eq([m.validated, m.silent, Math.round(m.silenceShare * 100)], [3, 1, 33]);
eq(m.roundsPerItem, 1);
eq([m.delivered, m.sold, m.deliveredVsSold], [3, 4, 0.75]);
eq(m.clients[0].evergreen, 2); eq(m.evergreenPerClient, 2);
ok(!m.published || !metricRecords.find((r) => r.id === 'old' && m.onTime === 4), 'August is outside the period');

// What a client contact may see.
const view = portalView([client, { ...client, id: 'c2', name: 'Other' }, project, { ...project, id: 'p2', clientId: 'c2' },
  task({ id: 'mine', assignee: 'Yasmine', source: 'https://internal', reminders: ['24h'] }), task({ id: 'theirs', clientId: 'c2', projectId: 'p2' }),
  { id: 'cm', kind: 'comment', revision: 1, name: 'hello', taskId: 'mine', createdAt: '2026-09-02T10:00:00.000Z' },
  { id: 'ev1', kind: 'event', revision: 1, name: 'studio only', type: 'lock', audience: 'studio', taskId: 'mine', createdAt: '2026-09-02T10:00:00.000Z' },
  { id: 'ev2', kind: 'event', revision: 1, name: 'both', type: 'reminder', audience: 'both', taskId: 'mine', createdAt: '2026-09-02T10:00:00.000Z' },
], 'c1');
eq(view.map((r) => r.id).sort(), ['c1', 'cm', 'ev2', 'mine', 'p1']);
const mine = view.find((r) => r.id === 'mine');
ok(!('assignee' in mine) && !('source' in mine) && !('reminders' in mine), 'internal fields are stripped for clients');
ok(!('drive' in view[0]) && !('contract' in view[0]), 'studio links are stripped from the client record');

console.log(`${checks} flow rule checks passed: court, gates, J−${flow.lockDays} lock, ${flow.validationHours} h clock, rounds, sign-off, sweep idempotence, six metrics and the portal view.`);
