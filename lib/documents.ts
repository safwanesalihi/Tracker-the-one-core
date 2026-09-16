// Devis / Facture / Contract — pure derived helpers. Nothing here touches the database or React;
// subtotal/tax/total are always computed from lineItems, never stored, same as the rest of the
// derived state in lib/flow.ts (courtOf, isEvergreenReserve…).
import type { DocStatus, DocType, LineItem } from '@/lib/model';

export const docPrefixes: Record<DocType, string> = { devis: 'DEVIS', facture: 'FACTURE', contract: 'CONTRAT' };
export const docLabels: Record<DocType, string> = { devis: 'Devis', facture: 'Facture', contract: 'Contrat' };
export const docStatusesFor: Record<DocType, readonly DocStatus[]> = {
  devis: ['draft', 'sent', 'accepted', 'refused'],
  contract: ['draft', 'sent', 'accepted', 'refused'],
  facture: ['draft', 'sent', 'paid'],
};
export const docStatusLabels: Record<DocStatus, string> = {
  draft: 'Brouillon', sent: 'Envoyé', accepted: 'Accepté', refused: 'Refusé', paid: 'Payé',
};

export function computeTotals(lineItems: LineItem[] = [], taxRate = 0) {
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

/**
 * Next number for this type this year, e.g. DEVIS-2026-0004. `existingNumbers` may be scoped to
 * the right type/year already (the caller's SQL does that as an optimization) or not — this
 * function re-filters by the exact prefix itself, so it is correct either way.
 */
export function nextDocNumber(existingNumbers: string[], docType: DocType, year: number) {
  const prefix = `${docPrefixes[docType]}-${year}-`;
  const seq = existingNumbers.reduce((max, number) => {
    if (!number.startsWith(prefix)) return max;
    const n = Number(number.slice(prefix.length));
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0) + 1;
  return { seq, number: `${prefix}${String(seq).padStart(4, '0')}` };
}
