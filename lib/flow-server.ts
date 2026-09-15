// Runs The One Flow clocks against Postgres. Pure rules live in lib/flow.ts; this file only reads and writes rows.
import { batch, database, type Statement } from '@/lib/database';
import type { RecordItem } from '@/lib/model';
import { sweep } from '@/lib/flow';

type RecordRow = { id: string; kind: RecordItem['kind']; data: unknown; revision: number };
const parse = (data: unknown) => (typeof data === 'string' ? JSON.parse(data) : data) as Partial<RecordItem>;

export async function loadRecords(workspaceId: string): Promise<RecordItem[]> {
  const rows = await database().query<RecordRow>(
    "SELECT id, kind, data, revision FROM records WHERE workspace_id = $1 AND kind != 'meta'",
    [workspaceId],
  );
  return rows.map((row) => ({ ...parse(row.data), id: row.id, kind: row.kind, revision: row.revision })) as RecordItem[];
}

export const insertRecord = (record: RecordItem, owner: string, workspaceId: string, ignoreConflict = false): Statement => ({
  text: `INSERT INTO records (id, owner, workspace_id, kind, data, revision) VALUES ($1, $2, $3, $4, $5::jsonb, 1)${ignoreConflict ? ' ON CONFLICT (id) DO NOTHING' : ''}`,
  params: [record.id, owner, workspaceId, record.kind, JSON.stringify(record)],
});

/**
 * Applies auto-approvals, reminders, the J−1 sweep and J−7 alerts to one workspace.
 * Returns the number of rows touched. Safe to call on every request: it writes nothing when nothing is due.
 */
export async function applySweep(workspaceId: string, rows?: RecordItem[], now = new Date()) {
  const records = rows ?? await loadRecords(workspaceId);
  const { tasks, events } = sweep(records, now);
  if (!tasks.length && !events.length) return 0;
  const statements: Statement[] = tasks.map((task) => {
    const before = records.find((r) => r.id === task.id)!;
    // A status change means every open browser holds stale data; reminder bookkeeping does not.
    const bump = before.status !== task.status ? 1 : 0;
    return {
      text: 'UPDATE records SET data = $1::jsonb, revision = revision + $2 WHERE id = $3 AND workspace_id = $4 AND revision = $5',
      params: [JSON.stringify(task), bump, task.id, workspaceId, before.revision],
    };
  });
  for (const event of events) statements.push(insertRecord(event, 'system', workspaceId, true));
  await batch(database(), statements);
  return statements.length;
}

/** Cron entry point: every workspace, one after the other. */
export async function sweepAllWorkspaces(now = new Date()) {
  const workspaces = await database().query<{ id: string }>('SELECT id FROM workspaces');
  let touched = 0;
  for (const { id } of workspaces) touched += await applySweep(id, undefined, now);
  return { workspaces: workspaces.length, touched };
}
