// The One Flow — the rules of the studio, as pure functions.
// Nothing in here touches the database, the network or React. Every transition the
// API applies and every number the Pilotage page shows comes from this file.
import type { RecordItem, SignOff, Status } from '@/lib/model';

export const flow = {
  timeZone: 'Africa/Casablanca',
  validationHours: 48,          // silence-is-approval clock, from the moment a deliverable is sent
  reminderHoursLeft: [24, 6],   // reminders to the client while the clock runs
  maxRevisionRounds: 2,         // consolidated rounds included in the retainer; round 3 is "hors forfait"
  lockDays: 7,                  // J−7: the calendar is frozen; new or re-dated items need an admin override
  evergreenTarget: 3,           // approved, undated items to keep in reserve per client
  // Four backward gates counted from the publish date J (the task's `due`).
  gates: [
    { key: 'brief', label: 'Brief validé', offset: 14 },
    { key: 'send', label: 'Envoi au client', offset: 7 },
    { key: 'validation', label: 'Validation client', offset: 5 },
    { key: 'ready', label: 'Prêt à publier', offset: 1 },
  ] as const,
  targets: {
    onTimeRate: 0.95, medianValidationHours: 24, silenceShare: 0.30,
    roundsPerItem: 1.4, deliveredVsSold: [1.0, 1.05] as const, evergreen: 3,
  },
};

export type GateKey = (typeof flow.gates)[number]['key'];
export type Court = 'studio' | 'client' | 'done';

// ---------- dates ----------

export function dayIn(date: Date, timeZone = flow.timeZone) {
  // en-CA gives YYYY-MM-DD; the studio's day, not the server's.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function shiftDay(day: string, days: number) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string) {
  return Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86400000);
}
export const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

// ---------- derived state ----------

/** Who has to act next. Derived from the status, never typed (Stitch Kit §2.3). */
export function courtOf(task: Pick<RecordItem, 'status' | 'publishedAt' | 'archived'>): Court {
  if (task.archived || task.publishedAt) return 'done';
  if (task.status === 'À valider') return 'client';
  return 'studio';
}
export const courtLabels: Record<Court, string> = { studio: 'Studio', client: 'Client', done: 'Terminé' };

/** Internal work (copywriting, prémontage…) is never published: no gates, no lock, no editorial plan. */
export const isPublishable = (task: Pick<RecordItem, 'publishable'>) => task.publishable !== false;

export function approvalDueAt(sentAt: string) {
  return new Date(new Date(sentAt).getTime() + flow.validationHours * 3600 * 1000).toISOString();
}
export function hoursLeft(task: Pick<RecordItem, 'approvalDueAt'>, now: Date) {
  if (!task.approvalDueAt) return null;
  return (new Date(task.approvalDueAt).getTime() - now.getTime()) / 3600000;
}

export function revisionState(task: Pick<RecordItem, 'revisionRound'>) {
  const used = task.revisionRound ?? 0;
  return { used, included: flow.maxRevisionRounds, overBudget: used > flow.maxRevisionRounds, lastIncluded: used === flow.maxRevisionRounds };
}

export type Gate = { key: GateKey; label: string; day: string; reached: boolean; late: boolean };
/** The four backward gates for a publish date, with whether the task has passed each one. */
export function gatesFor(task: Pick<RecordItem, 'due' | 'status' | 'sentAt' | 'validatedAt' | 'publishedAt' | 'deliverable' | 'description' | 'publishable'>, today: string): Gate[] {
  if (!isDay(task.due) || !isPublishable(task)) return [];
  const reached: Record<GateKey, boolean> = {
    brief: !!task.description?.trim() || task.status !== 'À faire',
    send: !!task.sentAt || task.status === 'À valider' || task.status === 'Validé',
    validation: task.status === 'Validé',
    ready: task.status === 'Validé' && !!task.deliverable,
  };
  return flow.gates.map((gate) => {
    const day = shiftDay(task.due!, -gate.offset);
    return { key: gate.key, label: gate.label, day, reached: reached[gate.key], late: !reached[gate.key] && day < today };
  });
}

/** True when a publish date falls inside the frozen window (today … J−7). Past dates are backfills, not calendar moves. */
export function insideLock(due: string | undefined, today: string) {
  if (!isDay(due)) return false;
  const days = daysBetween(today, due);
  return days >= 0 && days < flow.lockDays;
}
/** The lock applies to creating a dated item in the window or moving an item's date into/inside it. */
export function lockApplies(previousDue: string | undefined, nextDue: string | undefined, today: string) {
  if (!isDay(nextDue) || !insideLock(nextDue, today)) return false;
  return previousDue !== nextDue;
}

export const isEvergreenReserve = (task: RecordItem) =>
  task.kind === 'task' && !!task.evergreen && isPublishable(task) && !task.archived && task.status === 'Validé' && !task.due && !task.publishedAt;

// ---------- transitions ----------

const historyEntry = (text: string, date: string) => ({ text, date });

export function sendForValidation(task: RecordItem, now: string): RecordItem {
  return { ...task, status: 'À valider', sentAt: now, approvalDueAt: approvalDueAt(now), reminders: [],
    history: [...(task.history ?? []), historyEntry(`Envoyé au client · validation tacite dans ${flow.validationHours} h`, now)].slice(-100) };
}

export function approve(task: RecordItem, signOff: SignOff): RecordItem {
  const label = signOff.mode === 'silence' ? `Validation tacite — ${flow.validationHours} h sans réponse`
    : signOff.mode === 'studio' ? `Validé depuis le studio par ${signOff.by}` : `Validé par ${signOff.by}`;
  return { ...task, status: 'Validé', validatedAt: signOff.at, signOff, approvalDueAt: undefined,
    history: [...(task.history ?? []), historyEntry(label, signOff.at)].slice(-100) };
}

export function requestChanges(task: RecordItem, by: string, now: string): RecordItem {
  const round = (task.revisionRound ?? 0) + 1;
  const note = round > flow.maxRevisionRounds ? ' · hors forfait' : '';
  return { ...task, status: 'En cours', revisionRound: round, approvalDueAt: undefined, validatedAt: undefined, signOff: undefined,
    history: [...(task.history ?? []), historyEntry(`Retours client — tour ${round}${note} (${by})`, now)].slice(-100) };
}

export function publish(task: RecordItem, publishedAt: string, by: string): RecordItem {
  return { ...task, publishedAt, history: [...(task.history ?? []), historyEntry(`Publié par ${by}`, publishedAt)].slice(-100) };
}

// ---------- the sweep (clocks, reminders, J−1, J−7) ----------

export type SweepResult = { tasks: RecordItem[]; events: RecordItem[] };

const event = (id: string, type: NonNullable<RecordItem['type']>, name: string, task: RecordItem, audience: RecordItem['audience'], createdAt: string): RecordItem =>
  ({ id, kind: 'event', revision: 1, name, type, audience, taskId: task.id, clientId: task.clientId, createdAt });

/**
 * Applies every timed rule to a workspace. Idempotent: running it twice produces nothing new.
 * Event ids are deterministic so INSERT OR IGNORE keeps them unique.
 */
export function sweep(records: RecordItem[], now: Date): SweepResult {
  const nowIso = now.toISOString();
  const today = dayIn(now);
  const tomorrow = shiftDay(today, 1);
  const parent = (id?: string) => records.find((r) => r.id === id);
  const active = (t: RecordItem) => !t.archived && !parent(t.clientId)?.archived && !parent(t.projectId)?.archived;
  const tasks: RecordItem[] = [];
  const events: RecordItem[] = [];

  for (const task of records) {
    if (task.kind !== 'task' || !active(task)) continue;

    if (task.status === 'À valider' && task.approvalDueAt) {
      const left = hoursLeft(task, now)!;
      if (left <= 0) {
        const signed = approve(task, { mode: 'silence', by: 'Validation tacite', at: task.approvalDueAt, round: task.revisionRound ?? 0 });
        tasks.push(signed);
        events.push(event(`evt:${task.id}:auto:${task.approvalDueAt}`, 'auto-approved', `« ${task.name} » validé tacitement — ${flow.validationHours} h sans réponse du client.`, task, 'both', nowIso));
        continue;
      }
      // Several thresholds may be past at once (a long outage, or a demo seed): mark them all, remind once.
      const sent = new Set(task.reminders ?? []);
      const due = flow.reminderHoursLeft.filter((hours) => left <= hours && !sent.has(`${hours}h`));
      if (due.length) {
        for (const hours of due) sent.add(`${hours}h`);
        const key = `${Math.min(...due)}h`;
        events.push(event(`evt:${task.id}:remind:${key}:${task.approvalDueAt}`, 'reminder', `Rappel : « ${task.name} » sera validé tacitement dans ${Math.max(1, Math.round(left))} h sans réponse.`, task, 'both', nowIso));
        tasks.push({ ...task, reminders: [...sent] });
      }
    }

    if (isDay(task.due) && !task.publishedAt && isPublishable(task)) {
      // J−1 sweep: anything publishing tomorrow that is not validated.
      if (task.due === tomorrow && task.status !== 'Validé') {
        events.push(event(`evt:${task.id}:j1:${task.due}`, 'sweep', `Balayage J−1 : « ${task.name} » se publie demain et n’est pas validé (${task.status}).`, task, 'studio', nowIso));
      }
      // J−7 alert: inside the lock window and still not with the client.
      if (insideLock(task.due, today) && (task.status === 'À faire' || task.status === 'En cours') && !task.sentAt) {
        events.push(event(`evt:${task.id}:j7:${task.due}`, 'lock', `Verrou J−7 : « ${task.name} » se publie le ${task.due} et n’a pas été envoyé au client.`, task, 'studio', nowIso));
      }
    }
  }
  return { tasks, events };
}

// ---------- the six numbers ----------

export type Period = { from: string; to: string }; // inclusive days
export type ClientMetric = { clientId: string; name: string; quota: number | null; delivered: number; ratio: number | null; evergreen: number };
export type Metrics = {
  period: Period;
  onTimeRate: number | null; published: number; onTime: number;
  medianValidationHours: number | null; explicitDecisions: number;
  silenceShare: number | null; validated: number; silent: number;
  roundsPerItem: number | null;
  deliveredVsSold: number | null; delivered: number; sold: number;
  evergreenPerClient: number | null;
  clients: ClientMetric[];
};

export function monthPeriod(day: string): Period {
  const from = day.slice(0, 8) + '01';
  const [y, m] = day.split('-').map(Number);
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from, to };
}

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const inPeriod = (iso: string | undefined, period: Period) => !!iso && dayIn(new Date(iso)) >= period.from && dayIn(new Date(iso)) <= period.to;

export function computeMetrics(records: RecordItem[], period: Period): Metrics {
  const clients = records.filter((r) => r.kind === 'client' && !r.archived);
  const tasks = records.filter((r) => r.kind === 'task' && !r.archived);

  const published = tasks.filter((t) => inPeriod(t.publishedAt, period));
  const onTime = published.filter((t) => !isDay(t.due) || dayIn(new Date(t.publishedAt!)) <= t.due);

  const validated = tasks.filter((t) => t.signOff && inPeriod(t.signOff.at, period));
  const explicit = validated.filter((t) => t.signOff!.mode === 'explicit' && t.sentAt);
  const silent = validated.filter((t) => t.signOff!.mode === 'silence');
  const hours = explicit.map((t) => (new Date(t.signOff!.at).getTime() - new Date(t.sentAt!).getTime()) / 3600000).filter((h) => h >= 0);
  const rounds = validated.map((t) => t.revisionRound ?? 0);

  const perClient: ClientMetric[] = clients.map((client) => {
    const quota = client.quota && /^\d+$/.test(client.quota) ? Number(client.quota) : null;
    const delivered = published.filter((t) => t.clientId === client.id).length;
    return { clientId: client.id, name: client.name, quota, delivered, ratio: quota ? delivered / quota : null,
      evergreen: tasks.filter((t) => t.clientId === client.id && isEvergreenReserve(t)).length };
  });
  const sold = perClient.reduce((sum, c) => sum + (c.quota ?? 0), 0);
  const deliveredSold = perClient.filter((c) => c.quota).reduce((sum, c) => sum + c.delivered, 0);

  return {
    period,
    onTimeRate: published.length ? onTime.length / published.length : null, published: published.length, onTime: onTime.length,
    medianValidationHours: median(hours), explicitDecisions: explicit.length,
    silenceShare: validated.length ? silent.length / validated.length : null, validated: validated.length, silent: silent.length,
    roundsPerItem: rounds.length ? rounds.reduce((a, b) => a + b, 0) / rounds.length : null,
    deliveredVsSold: sold ? deliveredSold / sold : null, delivered: deliveredSold, sold,
    evergreenPerClient: clients.length ? perClient.reduce((sum, c) => sum + c.evergreen, 0) / clients.length : null,
    clients: perClient,
  };
}

export const statusOrder: readonly Status[] = ['À faire', 'En cours', 'À valider', 'Validé'];

// ---------- what a client contact may see ----------

const clientHiddenTaskFields = ['assignee', 'assigneeId', 'source', 'lockOverride', 'reminders', 'demo', 'timeEntries'] as const;

/** The portal slice of a workspace: one client, its projects, tasks, comments and client-facing events. */
export function portalView(records: RecordItem[], clientId: string): RecordItem[] {
  const client = records.find((r) => r.kind === 'client' && r.id === clientId && !r.archived);
  if (!client) return [];
  const projects = records.filter((r) => r.kind === 'project' && r.clientId === clientId && !r.archived);
  const projectIds = new Set(projects.map((p) => p.id));
  const tasks = records
    .filter((r) => r.kind === 'task' && r.clientId === clientId && !r.archived && (!r.projectId || projectIds.has(r.projectId)))
    .map((task) => { const copy = { ...task }; for (const key of clientHiddenTaskFields) delete copy[key]; return copy; });
  const taskIds = new Set(tasks.map((t) => t.id));
  const comments = records.filter((r) => r.kind === 'comment' && !!r.taskId && taskIds.has(r.taskId));
  const events = records.filter((r) => r.kind === 'event' && r.audience !== 'studio' && !!r.taskId && taskIds.has(r.taskId));
  // Devis/factures/contrats addressed to this client — never anyone else's.
  const documents = records.filter((r) => r.kind === 'document' && r.clientId === clientId);
  const { drive, contract, ...visibleClient } = client;
  void drive; void contract;
  return [visibleClient, ...projects, ...tasks, ...comments, ...events, ...documents];
}

// ---------- what a creative (member) may see ----------

/** A member sees every client and project, plus the tasks assigned to them and the unassigned ones they can pick up. */
export function memberView(records: RecordItem[], identities: string[], userId?: string): RecordItem[] {
  const mine = new Set(identities.map((v) => v.trim().toLowerCase()).filter(Boolean));
  const visible = (task: RecordItem) => !task.assignee?.trim() || (task.assigneeId ? task.assigneeId === userId : mine.has(task.assignee.trim().toLowerCase()));
  const clients = records.filter((r) => r.kind === 'client');
  const projects = records.filter((r) => r.kind === 'project');
  const tasks = records.filter((r) => r.kind === 'task' && visible(r));
  const taskIds = new Set(tasks.map((t) => t.id));
  const comments = records.filter((r) => r.kind === 'comment' && !!r.taskId && taskIds.has(r.taskId));
  const events = records.filter((r) => r.kind === 'event' && !!r.taskId && taskIds.has(r.taskId));
  // Shared team resources — visible to every studio role, this one included. Devis/factures/
  // contrats ('document') are deliberately never added here: a member never sees them exist.
  const library = records.filter((r) => r.kind === 'library');
  return [...clients, ...projects, ...tasks, ...comments, ...events, ...library];
}
