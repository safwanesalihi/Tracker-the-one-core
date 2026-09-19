import { useState, useMemo } from "react";
import { DocType, LineItem, RecordItem } from "@/lib/model";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Plus, Loader2 } from "lucide-react";
import DatePicker from "@/app/date-picker";
import { computeTotals } from "@/lib/documents";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FactureEditor({ draft, onClose, onSave, saving, t }: { draft: any; onClose: () => void; onSave: (doc: any) => void; saving: boolean; t: (k: string) => string; }) {
  const [doc, setDoc] = useState(draft);

  const setLine = (i: number, changes: Partial<LineItem>) => {
    const updated = [...doc.lineItems];
    updated[i] = { ...updated[i], ...changes };
    setDoc({ ...doc, lineItems: updated });
  };
  const addLine = () => setDoc({ ...doc, lineItems: [...doc.lineItems, { description: '', quantity: 1, unitPrice: 0 }] });
  const removeLine = (i: number) => setDoc({ ...doc, lineItems: doc.lineItems.filter((_: unknown, idx: number) => idx !== i) });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(doc);
  };

  if (!draft) return null;

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="tracker-modal document-modal">
        <DialogHeader>
          <DialogTitle>
            {draft?.id ? t('Modifier le document') : t('Nouveau document')}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={save}>
          <div className="form-pair" style={{ gap: '16px', marginBottom: '24px' }}>
            <div className="form-field" style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '13px', color: '#6B7280', marginBottom: '6px' }}>{t('Type')}</span>
              <Select 
                value={doc.docType} 
                onValueChange={(v) => setDoc({ ...doc, docType: v as DocType })}
              >
                <SelectTrigger className="pick" style={{ width: '100%' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="devis">{t('Devis')}</SelectItem>
                  <SelectItem value="facture">{t('Facture')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="form-field" style={{ flex: 2 }}>
              <span style={{ display: 'block', fontSize: '13px', color: '#6B7280', marginBottom: '6px' }}>{t('Client')}</span>
              <input 
                required
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                value={doc.counterparty || ''} 
                onChange={(e) => setDoc({ ...doc, counterparty: e.target.value })}
                placeholder={t("Nom du client")}
              />
            </div>
          </div>

          <div className="document-lines" style={{ marginBottom: '24px' }}>
            {doc.lineItems.length > 0 && (
              <div className="document-line" style={{ fontWeight: 600, fontSize: '12px', color: '#9CA3AF', marginBottom: '4px', padding: '0 4px' }}>
                <span>{t('Description')}</span>
                <span>{t('Quantité')}</span>
                <span>{t('Prix unit.')}</span>
                <span style={{ textAlign: 'right' }}>Total</span>
                <span></span>
              </div>
            )}
            
            {doc.lineItems.map((li: LineItem, i: number) => (
              <div className="document-line" key={i} style={{ marginBottom: '8px' }}>
                <input 
                  placeholder={t('Description de l\'article ou service')} 
                  required
                  maxLength={300} 
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                  value={li.description} 
                  onChange={(e) => setLine(i, { description: e.target.value })} 
                />
                <input 
                  type="number" min={0} step="1" 
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                  value={li.quantity} 
                  onChange={(e) => setLine(i, { quantity: Number(e.target.value) || 0 })} 
                  aria-label={t('Quantité')} 
                />
                <input 
                  type="number" min={0} step="0.01" 
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                  value={li.unitPrice} 
                  onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) || 0 })} 
                  aria-label={t('Prix unitaire')} 
                />
                <span className="document-line-total">{(li.quantity * li.unitPrice).toFixed(2)}</span>
                <button type="button" className="icon-button danger" aria-label={t('Retirer la ligne')} onClick={() => removeLine(i)}>
                  <Trash2 size={16} color="#ef4444" />
                </button>
              </div>
            ))}
            <button type="button" className="text-link" onClick={addLine} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#B8962E', fontWeight: 500, fontSize: '13px', marginTop: '8px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
              <Plus size={14} /> {t('Ajouter une ligne')}
            </button>
          </div>

          <div className="form-pair" style={{ gap: '16px', marginBottom: '16px' }}>
            <div className="form-field" style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '13px', color: '#6B7280', marginBottom: '6px' }}>{t('TVA (%)')}</span>
              <input type="number" min={0} max={100} step="0.01" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '6px' }} value={doc.taxRate || ''} onChange={(e) => setDoc({ ...doc, taxRate: e.target.value })} />
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '13px', color: '#6B7280', marginBottom: '6px' }}>{t('Émis le')}</span>
              <DatePicker label={t('Émis le')} value={doc.issuedAt} onChange={(v) => setDoc({ ...doc, issuedAt: v })} placeholder={t('Choisir')} />
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              {doc.docType === 'facture' ? (
                <>
                  <span style={{ display: 'block', fontSize: '13px', color: '#6B7280', marginBottom: '6px' }}>{t('Échéance')}</span>
                  <DatePicker label={t('Échéance')} value={doc.dueAt} onChange={(v) => setDoc({ ...doc, dueAt: v })} placeholder={t('Choisir')} />
                </>
              ) : (
                <>
                  <span style={{ display: 'block', fontSize: '13px', color: '#6B7280', marginBottom: '6px' }}>{t('Valable jusqu’au')}</span>
                  <DatePicker label={t('Valable jusqu’au')} value={doc.validUntil} onChange={(v) => setDoc({ ...doc, validUntil: v })} placeholder={t('Choisir')} />
                </>
              )}
            </div>
          </div>

          <div className="form-field" style={{ marginBottom: '24px' }}>
            <span style={{ display: 'block', fontSize: '13px', color: '#6B7280', marginBottom: '6px' }}>{t('Notes')}</span>
            <textarea rows={2} maxLength={5000} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '6px', resize: 'vertical' }} value={doc.notes || ''} onChange={(e) => setDoc({ ...doc, notes: e.target.value })} />
          </div>

          <DialogFooter className="modal-footer" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "16px", marginTop: "8px" }}>
            <button type="button" className="btn" disabled={saving} onClick={onClose}>
              {t('Annuler')}
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? <Loader2 size={15} className="spin" /> : null}
              {t(doc.id ? 'Enregistrer' : 'Créer')}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
