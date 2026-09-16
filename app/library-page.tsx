'use client';
// Shared team resources: prompts (text), assets/plugins/presets (a link — no file upload here).
// Visible to every studio role except the client portal, which never renders this page at all.
import { useState } from 'react';
import { BookOpen, Copy, ExternalLink, Loader2, Plus, Trash2, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/app/locale-provider';
import { libraryCategories, safeLink, type LibraryCategory, type RecordItem } from '@/lib/model';

type Props = {
  records: RecordItem[];
  canEdit: boolean;
  busy: boolean;
  onChange: (body: unknown) => Promise<unknown>;
  onRefresh: () => void;
};

const categoryLabels: Record<LibraryCategory, string> = { prompt: 'Prompt', asset: 'Asset', plugin: 'Plugin', preset: 'Preset' };
type Draft = { id?: string; revision?: number; name: string; category: LibraryCategory; content: string; link: string; description: string };
const emptyDraft: Draft = { name: '', category: 'prompt', content: '', link: '', description: '' };

export default function LibraryPage({ records, canEdit, busy, onChange, onRefresh }: Props) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<'all' | LibraryCategory>('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<RecordItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const items = records
    .filter((r) => r.kind === 'library' && (filter === 'all' || r.category === filter))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const disabled = busy || saving;

  function openNew() { setError(''); setDraft({ ...emptyDraft }); }
  function openEdit(item: RecordItem) {
    setError('');
    setDraft({ id: item.id, revision: item.revision, name: item.name, category: item.category || 'prompt', content: item.content || '', link: item.link || '', description: item.description || '' });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true); setError('');
    try {
      const data = { name: draft.name, category: draft.category, description: draft.description || undefined,
        ...(draft.category === 'prompt' ? { content: draft.content } : { link: draft.link }) };
      if (draft.id) await onChange({ action: 'update', kind: 'library', id: draft.id, revision: draft.revision, data });
      else await onChange({ action: 'create', kind: 'library', data });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('Enregistrement impossible. Réessayez.'));
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

  return <div className="library-page">
    <div className="page-heading">
      <span className="page-symbol" aria-hidden="true"><BookOpen size={22} /></span>
      <div className="heading-line"><h1>{t('Bibliothèque')}</h1>{canEdit && <button className="btn primary" onClick={openNew}><Plus size={16} />{t('Ajouter une ressource')}</button>}</div>
      <p>{t('Prompts, assets, plugins et presets partagés par l’équipe.')}</p>
    </div>
    <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
      <TabsList>
        <TabsTrigger value="all">{t('Tout')}</TabsTrigger>
        {libraryCategories.map((c) => <TabsTrigger key={c} value={c}>{t(categoryLabels[c])}</TabsTrigger>)}
      </TabsList>
    </Tabs>
    {items.length ? <div className="database-card"><div className="table-area"><Table>
      <TableHeader><TableRow><TableHead>{t('Nom')}</TableHead><TableHead>{t('Catégorie')}</TableHead><TableHead>{t('Contenu')}</TableHead><TableHead>{t('Ajouté par')}</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>{items.map((item) => <TableRow key={item.id}>
        <TableCell><strong>{item.name}</strong>{item.description && <small className="small-note">{item.description}</small>}</TableCell>
        <TableCell><span className="team-role-label">{t(categoryLabels[item.category || 'prompt'])}</span></TableCell>
        <TableCell>{item.category === 'prompt'
          ? <button type="button" className="text-link" onClick={() => void copyContent(item.content || '', item.id)}><Copy size={13} />{copied === item.id ? t('Copié') : t('Copier le texte')}</button>
          : item.link ? <a className="text-link" href={safeLink(item.link)} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} />{t('Ouvrir le lien')}</a> : <span className="small-note">{t('Aucun lien')}</span>}
        </TableCell>
        <TableCell><small className="small-note">{item.author || '—'}</small></TableCell>
        <TableCell>{canEdit && <div className="row-actions">
          <button type="button" className="icon-button" aria-label={t('Modifier')} disabled={disabled} onClick={() => openEdit(item)}><Pencil size={14} /></button>
          <button type="button" className="icon-button danger" aria-label={t('Supprimer')} disabled={disabled} onClick={() => setRemoving(item)}><Trash2 size={14} /></button>
        </div>}</TableCell>
      </TableRow>)}</TableBody>
    </Table></div></div> : <Empty><EmptyHeader><BookOpen size={24} /><EmptyTitle>{t('Aucune ressource')}</EmptyTitle><EmptyDescription>{t('Ajoutez un premier prompt, asset, plugin ou preset pour l’équipe.')}</EmptyDescription></EmptyHeader><button className="btn" onClick={onRefresh}>{t('Actualiser')}</button></Empty>}

    <Dialog open={!!draft} onOpenChange={(open) => { if (!open && !saving) setDraft(null); }}>
      <DialogContent className="tracker-modal">
        <DialogHeader><DialogTitle>{draft?.id ? t('Modifier la ressource') : t('Ajouter une ressource')}</DialogTitle><DialogDescription>{t('Visible par toute l’équipe du studio.')}</DialogDescription></DialogHeader>
        {draft && <form onSubmit={save}>
          <label className="form-field"><span>{t('Nom')}</span><input required maxLength={160} value={draft.name} disabled={disabled} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="form-field"><span>{t('Catégorie')}</span>
            <Select value={draft.category} disabled={disabled} onValueChange={(value) => setDraft({ ...draft, category: value as LibraryCategory })}>
              <SelectTrigger className="pick" aria-label={t('Catégorie')}><SelectValue /></SelectTrigger>
              <SelectContent>{libraryCategories.map((c) => <SelectItem key={c} value={c}>{t(categoryLabels[c])}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          {draft.category === 'prompt'
            ? <label className="form-field"><span>{t('Texte du prompt')}</span><textarea required rows={6} maxLength={20000} value={draft.content} disabled={disabled} onChange={(e) => setDraft({ ...draft, content: e.target.value })} /></label>
            : <label className="form-field"><span>{t('Lien')}</span><input type="url" required maxLength={2000} placeholder="https://…" value={draft.link} disabled={disabled} onChange={(e) => setDraft({ ...draft, link: e.target.value })} /></label>}
          <label className="form-field"><span>{t('Description')}</span><textarea rows={2} maxLength={2000} value={draft.description} disabled={disabled} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <DialogFooter className="modal-footer"><button type="button" className="btn" disabled={saving} onClick={() => setDraft(null)}>{t('Annuler')}</button><button className="btn primary" disabled={disabled}>{saving ? <Loader2 size={15} className="spin" /> : null}{t(draft.id ? 'Enregistrer' : 'Ajouter')}</button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!removing} onOpenChange={(open) => { if (!open && !saving) setRemoving(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t('Supprimer cette ressource ?')}</AlertDialogTitle><AlertDialogDescription>{t('« {name} » sera retiré de la bibliothèque pour toute l’équipe.', { name: removing?.name || '' })}</AlertDialogDescription></AlertDialogHeader>
        {error && <p className="form-error" role="alert">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>{t('Annuler')}</AlertDialogCancel><AlertDialogAction disabled={disabled} onClick={(e) => { e.preventDefault(); void remove(); }}>{t(saving ? 'Suppression…' : 'Supprimer')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
