import { type RecordItem, type Status } from '@/lib/model';

export type TaskDraft = {
  name: string; clientId: string; projectId: string; assignee: string;
  due: string; source: string; deliverable: string; status: Status;
};

export function emptyTaskDraft(context: { clientId?: string; status?: Status; date?: string } = {}): TaskDraft {
  return { name: '', clientId: context.clientId || '', projectId: '', assignee: '',
    due: context.date || '', source: '', deliverable: '', status: context.status || 'À faire' };
}

export function editTaskDraft(draft: TaskDraft, key: keyof TaskDraft, value: string): TaskDraft {
  return { ...draft, [key]: value, ...(key === 'clientId' ? { projectId: '' } : {}) };
}

export function taskDraftError(draft: TaskDraft, clients: RecordItem[], projects: RecordItem[]) {
  if (!draft.name.trim()) return 'Donnez un nom à la tâche.';
  if (!clients.some(c => c.id === draft.clientId && !c.archived)) return 'Choisissez un client actif.';
  if (!projects.some(p => p.id === draft.projectId && p.clientId === draft.clientId && !p.archived)) return 'Choisissez un sous-projet actif de ce client.';
  return '';
}
