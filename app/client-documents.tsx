'use client';
// Devis, factures and contrats for one client — owner-only, embedded as a tab on the client
// overview page. Saved, sequentially-numbered records with a full history; financial fields lock
// once a document has left "draft" (archive it instead of editing further).
import { useState } from 'react';
import { Archive, Download, FileSignature, Loader2, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DatePicker from '@/app/date-picker';
import { useI18n } from '@/app/locale-provider';
import { docTypes, type DocStatus, type DocType, type LineItem, type RecordItem } from '@/lib/model';
import { computeTotals, docLabels, docStatusesFor, docStatusLabels } from '@/lib/documents';
import { buildDocumentPdf, downloadPdf } from '@/lib/document-pdf';

type Props = {
  client: RecordItem;
  records: RecordItem[];
  busy: boolean;
  onChange: (body: unknown) => Promise<unknown>;
  onError: (message: string) => void;
};

type Draft = {
  id?: string; revision?: number; docType: DocType; docStatus: DocStatus;
  lineItems: LineItem[]; taxRate: string; issuedAt: string; dueAt: string; validUntil: string; notes: string;
};
const emptyDraft = (docType: DocType): Draft => ({
  docType, docStatus: 'draft', lineItems: [{ description: '', quantity: 1, unitPrice: 0 }],
  taxRate: '20', issuedAt: '', dueAt: '', validUntil: '', notes: '',
});
const money = (value: number) => `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;

export default function ClientDocuments({ client, records, busy, onChange, onError }: Props) {
  const { t, tag } = useI18n();
  const [filter, setFilter] = useState<'all' | DocType>('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<RecordItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState('');
  const disabled = busy || saving;

  const documents = records
    .filter((r) => r.kind === 'document' && r.clientId === client.id && !r.archived && (filter === 'all' || r.docType === filter))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  function openNew(docType: DocType) { setError(''); setDraft(emptyDraft(docType)); }
  function openEdit(doc: RecordItem) {
    setError('');
    setDraft({
      id: doc.id, revision: doc.revision, docType: doc.docType!, docStatus: doc.docStatus || 'draft',
      lineItems: doc.lineItems?.length ? doc.lineItems : [{ description: '', quantity: 1, unitPrice: 0 }],
      taxRate: doc.taxRate != null ? String(doc.taxRate) : '', issuedAt: doc.issuedAt || '', dueAt: doc.dueAt || '',
      validUntil: doc.validUntil || '', notes: doc.notes || '',
    });
  }
  function setLine(index: number, changes: Partial<LineItem>) {
    if (!draft) return;
    setDraft({ ...draft, lineItems: draft.lineItems.map((li, i) => (i === index ? { ...li, ...changes } : li)) });
  }
  function addLine() { if (draft) setDraft({ ...draft, lineItems: [...draft.lineItems, { description: '', quantity: 1, unitPrice: 0 }] }); }
  function removeLine(index: number) { if (draft) setDraft({ ...draft, lineItems: draft.lineItems.filter((_, i) => i !== index) }); }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true); setError('');
    try {
      const data = {
        docType: draft.docType, clientId: client.id, docStatus: draft.docStatus,
        lineItems: draft.lineItems.filter((li) => li.description.trim()),
        taxRate: draft.taxRate ? Number(draft.taxRate) : undefined,
        issuedAt: draft.issuedAt || undefined, dueAt: draft.dueAt || undefined, validUntil: draft.validUntil || undefined,
        notes: draft.notes || undefined,
      };
      if (draft.id) await onChange({ action: 'update', kind: 'document', id: draft.id, revision: draft.revision, data });
      else await onChange({ action: 'create', kind: 'document', data });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('Enregistrement impossible. Réessayez.'));
    } finally { setSaving(false); }
  }
  async function setStatus(doc: RecordItem, docStatus: DocStatus) {
    try {
      await onChange({ action: 'update', kind: 'document', id: doc.id, revision: doc.revision, data: {
        docType: doc.docType, clientId: doc.clientId, docStatus, lineItems: doc.lineItems || [], taxRate: doc.taxRate,
        issuedAt: doc.issuedAt, dueAt: doc.dueAt, validUntil: doc.validUntil, notes: doc.notes,
      } });
    } catch (e) { onError(e instanceof Error ? t(e.message) : t('Modification impossible. Réessayez.')); }
  }
  async function archive(doc: RecordItem) {
    try {
      await onChange({ action: 'update', kind: 'document', id: doc.id, revision: doc.revision, data: {
        docType: doc.docType, clientId: doc.clientId, docStatus: doc.docStatus, lineItems: doc.lineItems || [], taxRate: doc.taxRate,
        issuedAt: doc.issuedAt, dueAt: doc.dueAt, validUntil: doc.validUntil, notes: doc.notes, archived: true,
      } });
    } catch (e) { onError(e instanceof Error ? t(e.message) : t('Archivage impossible. Réessayez.')); }
  }
  async function remove() {
    if (!removing) return;
    setSaving(true); setError('');
    try {
      await onChange({ action: 'delete', kind: 'document', id: removing.id, revision: removing.revision });
      setRemoving(null);
    } catch (e) {
      setError(e instanceof Error ? t(e.message) : t('Suppression impossible. Réessayez.'));
    } finally { setSaving(false); }
  }
  async function downloadDoc(doc: RecordItem) {
    setPdfBusy(doc.id);
    try {
      const bytes = await buildDocumentPdf({
        docType: doc.docType!, number: doc.number!, docStatus: doc.docStatus || 'draft', studioName: 'The One Core',
        clientName: client.name, issuedAt: doc.issuedAt, dueAt: doc.dueAt, validUntil: doc.validUntil,
        lineItems: doc.lineItems || [], taxRate: doc.taxRate, notes: doc.notes,
      });
      downloadPdf(bytes, `${doc.number}.pdf`);
    } catch { onError(t('Génération du PDF impossible. Réessayez.')); } finally { setPdfBusy(''); }
  }

  const totals = draft ? computeTotals(draft.lineItems, draft.taxRate ? Number(draft.taxRate) : 0) : null;
  const locked = !!draft?.id && draft.docStatus !== 'draft';

  return <section className="client-documents">
    <div className="section-head">
      <div><h2>{t('Devis & factures')}</h2><p>{t('Visible uniquement par vous et ce client.')}</p></div>
      <button type="button" className="btn primary" onClick={() => openNew(filter === 'all' ? 'devis' : filter)}><Plus size={16} />{t('Nouveau')}</button>
    </div>
    <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
      <TabsList>
        <TabsTrigger value="all">{t('Tout')}</TabsTrigger>
        {docTypes.map((dt) => <TabsTrigger key={dt} value={dt}>{t(docLabels[dt])}</TabsTrigger>)}
      </TabsList>
    </Tabs>
    {documents.length ? <div className="database-card"><div className="table-area"><Table>
      <TableHeader><TableRow><TableHead>{t('Numéro')}</TableHead><TableHead>{t('Type')}</TableHead><TableHead>{t('Statut')}</TableHead><TableHead>{t('Total')}</TableHead><TableHead>{t('Émis le')}</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>{documents.map((doc) => {
        const { total } = computeTotals(doc.lineItems || [], doc.taxRate);
        return <TableRow key={doc.id}>
          <TableCell><strong>{doc.number}</strong></TableCell>
          <TableCell>{t(docLabels[doc.docType || 'devis'])}</TableCell>
          <TableCell>
            <Select value={doc.docStatus || 'draft'} onValueChange={(value) => void setStatus(doc, value as DocStatus)}>
              <SelectTrigger className="pick" aria-label={t('Statut')}><SelectValue /></SelectTrigger>
              <SelectContent>{docStatusesFor[doc.docType || 'devis'].map((s) => <SelectItem key={s} value={s}>{t(docStatusLabels[s])}</SelectItem>)}</SelectContent>
            </Select>
          </TableCell>
          <TableCell>{money(total)}</TableCell>
          <TableCell>{doc.issuedAt ? new Date(`${doc.issuedAt}T12:00:00`).toLocaleDateString(tag, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</TableCell>
          <TableCell><div className="row-actions">
            <button type="button" className="icon-button" aria-label={t('Télécharger en PDF')} disabled={!!pdfBusy} onClick={() => void downloadDoc(doc)}>{pdfBusy === doc.id ? <Loader2 size={14} className="spin" /> : <Download size={14} />}</button>
            {doc.docStatus === 'draft'
              ? <>
                  <button type="button" className="icon-button" aria-label={t('Modifier')} onClick={() => openEdit(doc)}><FileSignature size={14} /></button>
                  <button type="button" className="icon-button danger" aria-label={t('Supprimer')} onClick={() => setRemoving(doc)}><Trash2 size={14} /></button>
                </>
              : <button type="button" className="icon-button" aria-label={t('Archiver')} onClick={() => void archive(doc)}><Archive size={14} /></button>}
          </div></TableCell>
        </TableRow>;
      })}</TableBody>
    </Table></div></div> : <Empty><EmptyHeader><FileSignature size={24} /><EmptyTitle>{t('Aucun document')}</EmptyTitle><EmptyDescription>{t('Créez un devis, une facture ou un contrat pour ce client.')}</EmptyDescription></EmptyHeader></Empty>}

    <Dialog open={!!draft} onOpenChange={(open) => { if (!open && !saving) setDraft(null); }}>
      <DialogContent className="tracker-modal document-modal">
        <DialogHeader><DialogTitle>{draft?.id ? t('Modifier le document') : t('Nouveau {type}', { type: draft ? t(docLabels[draft.docType]).toLocaleLowerCase(tag) : '' })}</DialogTitle><DialogDescription>{client.name}</DialogDescription></DialogHeader>
        {draft && <form onSubmit={save}>
          {locked && <p className="small-note">{t('Ce document a été envoyé : ses lignes et son montant ne peuvent plus changer. Archivez-le pour en créer un nouveau.')}</p>}
          <div className="document-lines">
            {draft.lineItems.map((li, i) => <div className="document-line" key={i}>
              <input placeholder={t('Description')} disabled={locked} maxLength={300} value={li.description} onChange={(e) => setLine(i, { description: e.target.value })} />
              <input type="number" min={0} step="1" disabled={locked} value={li.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) || 0 })} aria-label={t('Quantité')} />
              <input type="number" min={0} step="0.01" disabled={locked} value={li.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) || 0 })} aria-label={t('Prix unitaire')} />
              <span className="document-line-total">{money(li.quantity * li.unitPrice)}</span>
              {!locked && <button type="button" className="icon-button" aria-label={t('Retirer la ligne')} onClick={() => removeLine(i)}><Trash2 size={14} /></button>}
            </div>)}
            {!locked && <button type="button" className="text-link" onClick={addLine}><Plus size={13} />{t('Ajouter une ligne')}</button>}
          </div>
          <div className="form-pair">
            <label className="form-field"><span>{t('TVA (%)')}</span><input type="number" min={0} max={100} step="0.01" disabled={locked} value={draft.taxRate} onChange={(e) => setDraft({ ...draft, taxRate: e.target.value })} /></label>
            <label className="form-field"><span>{t('Émis le')}</span><DatePicker label={t('Émis le')} value={draft.issuedAt} onChange={(v) => setDraft({ ...draft, issuedAt: v })} placeholder={t('Choisir')} /></label>
          </div>
          {draft.docType === 'facture'
            ? <label className="form-field"><span>{t('Échéance')}</span><DatePicker label={t('Échéance')} value={draft.dueAt} onChange={(v) => setDraft({ ...draft, dueAt: v })} placeholder={t('Choisir')} /></label>
            : <label className="form-field"><span>{t('Valable jusqu’au')}</span><DatePicker label={t('Valable jusqu’au')} value={draft.validUntil} onChange={(v) => setDraft({ ...draft, validUntil: v })} placeholder={t('Choisir')} /></label>}
          <label className="form-field"><span>{t('Notes')}</span><textarea rows={3} maxLength={5000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
          {totals && <div className="document-totals">
            <span>{t('Sous-total')} <strong>{money(totals.subtotal)}</strong></span>
            {!!draft.taxRate && <span>{t('TVA')} <strong>{money(totals.taxAmount)}</strong></span>}
            <span className="document-total-big">{t('Total')} <strong>{money(totals.total)}</strong></span>
          </div>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <DialogFooter className="modal-footer"><button type="button" className="btn" disabled={saving} onClick={() => setDraft(null)}>{t('Annuler')}</button><button className="btn primary" disabled={disabled}>{saving ? <Loader2 size={15} className="spin" /> : null}{t(draft.id ? 'Enregistrer' : 'Créer')}</button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!removing} onOpenChange={(open) => { if (!open && !saving) setRemoving(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t('Supprimer ce brouillon ?')}</AlertDialogTitle><AlertDialogDescription>{t('« {number} » sera définitivement supprimé.', { number: removing?.number || '' })}</AlertDialogDescription></AlertDialogHeader>
        {error && <p className="form-error" role="alert">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>{t('Annuler')}</AlertDialogCancel><AlertDialogAction disabled={disabled} onClick={(e) => { e.preventDefault(); void remove(); }}>{t(saving ? 'Suppression…' : 'Supprimer')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
