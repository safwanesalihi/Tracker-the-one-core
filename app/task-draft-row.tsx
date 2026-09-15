'use client';

import { useEffect, useRef } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type RecordItem, statuses } from '@/lib/model';
import { editTaskDraft, type TaskDraft } from '@/lib/task-draft';
import DatePicker from '@/app/date-picker';
import { memberName, type WorkspaceMember } from '@/lib/workspace';

type Props = {
  draft: TaskDraft; clients: RecordItem[]; projects: RecordItem[];
  members?: WorkspaceMember[];
  busy: boolean; error: string; onChange: (draft: TaskDraft) => void;
  onSave: () => void; onCancel: () => void;
};

const formId = 'task-draft-form';

export default function TaskDraftRow({ draft, clients, projects, members = [], busy, onChange }: Props) {
  const nameInput = useRef<HTMLInputElement>(null);
  const activeClients = clients.filter(c => !c.archived);
  const activeProjects = projects.filter(p => p.clientId === draft.clientId && !p.archived);
  useEffect(() => {
    nameInput.current?.focus({ preventScroll: true });
    nameInput.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);
  const set = (key: keyof TaskDraft, value: string) => onChange(editTaskDraft(draft, key, value));
  const pick = (key: 'clientId' | 'projectId' | 'assignee' | 'status', label: string, items: { value: string; label: string }[], disabled = false) =>
    <Select value={draft[key] || '__none'} disabled={busy || disabled} onValueChange={value => set(key, value === '__none' ? '' : value)}>
      <SelectTrigger aria-label={label} className="draft-pick"><SelectValue /></SelectTrigger>
      <SelectContent>{key !== 'status' && <SelectItem value="__none">{label}</SelectItem>}{items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select>;
  return <TableRow className="task-draft-row" aria-label="Nouvelle tâche à remplir">
      <TableCell><input ref={nameInput} form={formId} required maxLength={160} aria-label="Nom de la nouvelle tâche" placeholder="Nom de la tâche…" value={draft.name} disabled={busy} onChange={e => set('name', e.target.value)} /></TableCell>
      <TableCell>{pick('status', 'Statut de la nouvelle tâche', statuses.map(s => ({ value: s, label: s })))}</TableCell>
      <TableCell>{pick('clientId', 'Choisir un client', activeClients.map(c => ({ value: c.id, label: c.name })))}</TableCell>
      <TableCell>{pick('projectId', 'Choisir un sous-projet', activeProjects.map(p => ({ value: p.id, label: p.name })), !draft.clientId)}</TableCell>
      <TableCell>{pick('assignee', 'Non assigné', members.map(member => ({ value: memberName(member), label: memberName(member) })))}</TableCell>
      <TableCell><DatePicker label="Échéance de la nouvelle tâche" value={draft.due} onChange={value => set('due', value)} /></TableCell>
      <TableCell><input form={formId} type="url" maxLength={2000} aria-label="Livrable de la nouvelle tâche" placeholder="https://…" value={draft.deliverable} disabled={busy} onChange={e => set('deliverable', e.target.value)} /></TableCell>
      <TableCell><input form={formId} type="url" maxLength={2000} aria-label="Source de la nouvelle tâche" placeholder="https://…" value={draft.source} disabled={busy} onChange={e => set('source', e.target.value)} /></TableCell>
    </TableRow>;
}

export function TaskDraftActions({ draft, clients, projects, busy, error, onSave, onCancel }: Omit<Props, 'onChange'>) {
  const activeClients = clients.filter(c => !c.archived);
  const activeProjects = projects.filter(p => p.clientId === draft.clientId && !p.archived);
  return <div className="task-draft-footer">
      <form id={formId} onSubmit={e => { e.preventDefault(); if (!busy) onSave(); }}>
        <div className="draft-guidance">
          <span>Brouillon · nom, client et sous-projet requis.</span>
          {!activeClients.length ? <span>Ajoutez d’abord un client et un sous-projet depuis « Clients ».</span>
            : draft.clientId && !activeProjects.length ? <span>Ajoutez un sous-projet depuis la fiche de ce client.</span> : null}
          {error && <span className="draft-error" role="alert">{error}</span>}
        </div>
        <div className="draft-actions">
          <button type="button" className="btn" disabled={busy} onClick={onCancel}><X size={15} />Annuler</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />}{busy ? 'Enregistrement…' : 'Enregistrer la tâche'}</button>
        </div>
      </form>
    </div>;
}
