'use client';
// Shared team resources: prompts (text), assets/plugins/presets (a link — no file upload here).
// Visible to every studio role except the client portal, which never renders this page at all.
import { useState, useRef, useEffect } from 'react';
import { BookOpen, Copy, ExternalLink, Loader2, Plus, Trash2, Check } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useI18n } from '@/app/locale-provider';
import { libraryCategories, safeLink, type LibraryCategory, type RecordItem } from '@/lib/model';

type Props = {
  records: RecordItem[];
  canEdit: boolean;
  busy: boolean;
  onChange: (body: unknown) => Promise<unknown>;
  onRefresh: () => void;
};

const categoryLabels: Record<LibraryCategory, string> = { prompt: 'Prompt', asset: 'Asset', plugin: 'Plugin', preset: 'Preset', website: 'Site web utile' };
type Draft = { id?: string; revision?: number; name: string; category: LibraryCategory; content: string; link: string; description: string };
const emptyDraft: Draft = { name: '', category: 'prompt', content: '', link: '', description: '' };

export default function LibraryPage({ records, canEdit, busy, onChange, onRefresh }: Props) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<'all' | LibraryCategory>('all');
  const [removing, setRemoving] = useState<RecordItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  
  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  
  const [newRow, setNewRow] = useState<Draft | null>(null);

  const items = records
    .filter((r) => r.kind === 'library' && (filter === 'all' || r.category === filter))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const disabled = busy || saving;

  async function saveDraft(d: Draft, isNew: boolean = false) {
    if (!d.name.trim()) {
      setError(t('Le nom est obligatoire.'));
      return false;
    }
    setSaving(true); setError('');
    try {
      const data = { name: d.name, category: d.category, description: d.description || undefined,
        ...(d.category === 'prompt' ? { content: d.content } : { link: d.link }) };
      if (!isNew && d.id) {
        await onChange({ action: 'update', kind: 'library', id: d.id, revision: d.revision, data });
      } else {
        await onChange({ action: 'create', kind: 'library', data });
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('Enregistrement impossible. Réessayez.'));
      return false;
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!removing) return;
    setSaving(true); setError('');
    try {
      await onChange({ action: 'delete', kind: 'library', id: removing.id, revision: removing.revision });
      setRemoving(null);
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('Suppression impossible. Réessayez.'));
    } finally { setSaving(false); }
  }

  async function copyContent(text: string, id: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1500); } catch { /* clipboard unavailable */ }
  }

  const startEdit = (item: RecordItem) => {
    if (!canEdit) return;
    setEditingId(item.id);
    setDraft({ id: item.id, revision: item.revision, name: item.name, category: item.category || 'prompt', content: item.content || '', link: item.link || '', description: item.description || '' });
    setNewRow(null);
  };

  const commitEdit = async () => {
    if (draft && editingId) {
      const success = await saveDraft(draft, false);
      if (success) setEditingId(null);
    }
  };

  const commitNewRow = async () => {
    if (newRow && newRow.name) {
      const success = await saveDraft(newRow, true);
      if (success) setNewRow(null);
    } else {
      setNewRow(null);
    }
  };

  return <div className="library-page">
    <div className="page-heading">
      <span className="page-symbol" aria-hidden="true"><BookOpen size={22} /></span>
      <div className="heading-line"><h1>{t('Bibliothèque')}</h1></div>
      <p>{t('Prompts, assets, plugins et presets partagés par l’équipe.')}</p>
    </div>
    
    <div style={{ marginBottom: 15 }}>
      <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
        <SelectTrigger aria-label={t("Filtrer par catégorie")} className="pick">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("Toutes catégories")}</SelectItem>
          {libraryCategories.map((c) => (
            <SelectItem key={c} value={c}>
              {t(categoryLabels[c])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    
    {error && <p className="form-error" role="alert" style={{ marginBottom: 15 }}>{error}</p>}
    
    <div className="database-card" style={{ padding: 0 }}>
      <div className="table-area">
        <Table className="task-table">
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: '25%' }}>{t('Nom')}</TableHead>
              <TableHead style={{ width: '15%' }}>{t('Catégorie')}</TableHead>
              <TableHead style={{ width: '35%' }}>{t('Contenu / Lien')}</TableHead>
              <TableHead style={{ width: '15%' }}>{t('Description')}</TableHead>
              <TableHead style={{ width: '10%' }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const isEditing = editingId === item.id;
              
              if (isEditing && draft) {
                return (
                  <TableRow key={item.id} className="editing-row">
                    <TableCell>
                      <input autoFocus className="inline-input" value={draft.name} disabled={disabled} onChange={e => setDraft({ ...draft, name: e.target.value })} onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()} />
                    </TableCell>
                    <TableCell>
                      <Select value={draft.category} disabled={disabled} onValueChange={(value) => { setDraft({ ...draft, category: value as LibraryCategory }); }}>
                        <SelectTrigger className="inline-pick" aria-label={t('Catégorie')}><SelectValue /></SelectTrigger>
                        <SelectContent>{libraryCategories.map((c) => <SelectItem key={c} value={c}>{t(categoryLabels[c])}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {draft.category === 'prompt' ? 
                        <input className="inline-input" placeholder="Prompt..." value={draft.content} disabled={disabled} onChange={e => setDraft({ ...draft, content: e.target.value })} onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()} /> :
                        <input className="inline-input" type="url" placeholder="https://..." value={draft.link} disabled={disabled} onChange={e => setDraft({ ...draft, link: e.target.value })} onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()} />
                      }
                    </TableCell>
                    <TableCell>
                      <input className="inline-input" placeholder="..." value={draft.description || ''} disabled={disabled} onChange={e => setDraft({ ...draft, description: e.target.value })} onBlur={commitEdit} onKeyDown={e => e.key === 'Enter' && commitEdit()} />
                    </TableCell>
                    <TableCell>
                      <div className="row-actions">
                        <button type="button" className="icon-button" onClick={commitEdit}><Check size={14} /></button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }

              return (
                <TableRow key={item.id} onClick={() => startEdit(item)} className="cursor-text group">
                  <TableCell><strong>{item.name}</strong></TableCell>
                  <TableCell><span className="team-role-label">{t(categoryLabels[item.category || 'prompt'])}</span></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {item.category === 'prompt'
                      ? <button type="button" className="text-link" onClick={() => void copyContent(item.content || '', item.id)}><Copy size={13} />{copied === item.id ? t('Copié') : t('Copier le texte')}</button>
                      : item.link ? <a className="text-link" href={safeLink(item.link)} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />{t('Ouvrir le lien')}</a> : <span className="small-note">{t('Aucun lien')}</span>}
                  </TableCell>
                  <TableCell><small className="small-note">{item.description || '—'}</small></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {canEdit && <div className="row-actions opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" className="icon-button danger" aria-label={t('Supprimer')} disabled={disabled} onClick={(e) => { e.stopPropagation(); setRemoving(item); }}><Trash2 size={14} /></button>
                    </div>}
                  </TableCell>
                </TableRow>
              );
            })}
            
            {newRow && (
              <TableRow className="editing-row">
                <TableCell>
                  <input autoFocus placeholder="Nom..." className="inline-input" value={newRow.name} disabled={disabled} onChange={e => setNewRow({ ...newRow, name: e.target.value })} onBlur={commitNewRow} onKeyDown={e => e.key === 'Enter' && commitNewRow()} />
                </TableCell>
                <TableCell>
                  <Select value={newRow.category} disabled={disabled} onValueChange={(value) => { setNewRow({ ...newRow, category: value as LibraryCategory }); }}>
                    <SelectTrigger className="inline-pick" aria-label={t('Catégorie')}><SelectValue /></SelectTrigger>
                    <SelectContent>{libraryCategories.map((c) => <SelectItem key={c} value={c}>{t(categoryLabels[c])}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {newRow.category === 'prompt' ? 
                    <input className="inline-input" placeholder="Prompt..." value={newRow.content} disabled={disabled} onChange={e => setNewRow({ ...newRow, content: e.target.value })} onBlur={commitNewRow} onKeyDown={e => e.key === 'Enter' && commitNewRow()} /> :
                    <input className="inline-input" type="url" placeholder="https://..." value={newRow.link} disabled={disabled} onChange={e => setNewRow({ ...newRow, link: e.target.value })} onBlur={commitNewRow} onKeyDown={e => e.key === 'Enter' && commitNewRow()} />
                  }
                </TableCell>
                <TableCell>
                  <input className="inline-input" placeholder="..." value={newRow.description || ''} disabled={disabled} onChange={e => setNewRow({ ...newRow, description: e.target.value })} onBlur={commitNewRow} onKeyDown={e => e.key === 'Enter' && commitNewRow()} />
                </TableCell>
                <TableCell>
                  <div className="row-actions">
                    <button type="button" className="icon-button" onClick={commitNewRow}><Check size={14} /></button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {canEdit && !newRow && (
        <button className="add-row w-full text-left p-3 hover:bg-muted text-sm text-muted-foreground flex items-center gap-2 border-t" disabled={disabled} onClick={() => { setEditingId(null); setNewRow({ ...emptyDraft }); }}>
          <Plus size={15} />
          {t('Nouvelle ressource')}
        </button>
      )}
    </div>

    {!items.length && !newRow && <Empty><EmptyHeader><BookOpen size={24} /><EmptyTitle>{t('Aucune ressource')}</EmptyTitle><EmptyDescription>{t('Ajoutez un premier prompt, asset, plugin ou preset pour l’équipe.')}</EmptyDescription></EmptyHeader><button className="btn" onClick={onRefresh}>{t('Actualiser')}</button></Empty>}

    <AlertDialog open={!!removing} onOpenChange={(open) => { if (!open && !saving) setRemoving(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t('Supprimer cette ressource ?')}</AlertDialogTitle><AlertDialogDescription>{t('« {name} » sera retiré de la bibliothèque pour toute l’équipe.', { name: removing?.name || '' })}</AlertDialogDescription></AlertDialogHeader>
        {error && <p className="form-error" role="alert">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>{t('Annuler')}</AlertDialogCancel><AlertDialogAction disabled={disabled} onClick={(e) => { e.preventDefault(); void remove(); }}>{t(saving ? 'Suppression…' : 'Supprimer')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
