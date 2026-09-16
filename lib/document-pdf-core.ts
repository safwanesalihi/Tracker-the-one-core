// A devis/facture/contrat as a real PDF: studio letterhead, client info, a line-items table,
// totals. Isomorphic (no DOM/fetch), mirroring lib/invite-pdf-core.ts's drawing approach exactly.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { computeTotals, docLabels, docStatusLabels } from '@/lib/documents';
import type { DocStatus, DocType, LineItem } from '@/lib/model';

const DARK = rgb(0x11 / 255, 0x11 / 255, 0x11 / 255);
const GOLD = rgb(0xe5 / 255, 0xa9 / 255, 0x3c / 255);
const INK = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.88, 0.88, 0.88);

// Legal mentions required on a Moroccan devis/facture/contrat — fixed for this studio, not per-workspace data.
const LEGAL_FOOTER = [
  'The One Core — SARL AU au capital de 100 000,00 DHS',
  'Siège social : Berrechid, Maroc',
  'RC : 27375 · IF : 72053158 · TP : 43102755 · ICE : 003921894000076',
  'Tél. : +212 6 07 48 48 22 · contact@the1core.com · the1core.com',
  'RIB : 007 621 0002585000000836 42',
];

// pdf-lib's standard fonts use WinAnsi encoding, which can't render the narrow no-break space
// (U+202F) that fr-FR number formatting uses as a thousands separator — swap it for a plain space.
const winAnsiSafe = (text: string) => text.replace(/[   ]/g, ' ');
const money = (value: number) => winAnsiSafe(`${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`);
const dateFr = (value?: string) => value ? winAnsiSafe(new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })) : '—';

export async function buildDocumentPdf({
  docType, number, docStatus, studioName, clientName, issuedAt, dueAt, validUntil,
  lineItems, taxRate, notes, logoPngBytes,
}: {
  docType: DocType;
  number: string;
  docStatus: DocStatus;
  studioName: string;
  clientName: string;
  issuedAt?: string;
  dueAt?: string;
  validUntil?: string;
  lineItems: LineItem[];
  taxRate?: number;
  notes?: string;
  logoPngBytes?: Uint8Array | ArrayBuffer | null;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;

  const headerHeight = 110;
  page.drawRectangle({ x: 0, y: height - headerHeight, width, height: headerHeight, color: DARK });
  if (logoPngBytes) {
    try {
      const logo = await pdf.embedPng(logoPngBytes);
      const logoWidth = 160;
      const logoHeight = (logo.height / logo.width) * logoWidth;
      page.drawImage(logo, { x: margin, y: height - headerHeight / 2 - logoHeight / 2, width: logoWidth, height: logoHeight });
    } catch {
      page.drawText(studioName, { x: margin, y: height - headerHeight / 2 - 8, size: 20, font: bold, color: rgb(1, 1, 1) });
    }
  } else {
    page.drawText(studioName, { x: margin, y: height - headerHeight / 2 - 8, size: 20, font: bold, color: rgb(1, 1, 1) });
  }
  page.drawText(docLabels[docType].toUpperCase(), { x: width - margin - 150, y: height - 42, size: 12, font: bold, color: GOLD });
  page.drawText(number, { x: width - margin - 150, y: height - 60, size: 12, font, color: rgb(1, 1, 1) });

  let y = height - headerHeight - 46;
  page.drawText(`${clientName}`, { x: margin, y, size: 18, font: bold, color: INK });
  y -= 22;
  page.drawText(`Statut : ${docStatusLabels[docStatus]}`, { x: margin, y, size: 11, font, color: MUTED });
  y -= 15;
  page.drawText(`Émis le ${dateFr(issuedAt)}`, { x: margin, y, size: 11, font, color: MUTED });
  if (docType === 'facture' && dueAt) { y -= 15; page.drawText(`Échéance : ${dateFr(dueAt)}`, { x: margin, y, size: 11, font, color: MUTED }); }
  if (docType !== 'facture' && validUntil) { y -= 15; page.drawText(`Valable jusqu’au ${dateFr(validUntil)}`, { x: margin, y, size: 11, font, color: MUTED }); }
  y -= 34;

  // Line-items table — no table library anywhere in this codebase; drawn by hand like every other PDF here.
  const cols = { desc: margin, qty: width - margin - 210, unit: width - margin - 140, total: width - margin - 60 };
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: RULE });
  y -= 16;
  page.drawText('Description', { x: cols.desc, y, size: 9, font: bold, color: MUTED });
  page.drawText('Qté', { x: cols.qty, y, size: 9, font: bold, color: MUTED });
  page.drawText('P.U.', { x: cols.unit, y, size: 9, font: bold, color: MUTED });
  page.drawText('Total', { x: cols.total, y, size: 9, font: bold, color: MUTED });
  y -= 12;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: RULE });
  y -= 18;
  for (const item of lineItems) {
    const lineTotal = item.quantity * item.unitPrice;
    page.drawText(item.description.slice(0, 70), { x: cols.desc, y, size: 10.5, font, color: INK, maxWidth: cols.qty - cols.desc - 10 });
    page.drawText(String(item.quantity), { x: cols.qty, y, size: 10.5, font, color: INK });
    page.drawText(money(item.unitPrice), { x: cols.unit, y, size: 10.5, font, color: INK });
    page.drawText(money(lineTotal), { x: cols.total, y, size: 10.5, font, color: INK });
    y -= 20;
  }
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: RULE });
  y -= 22;

  const { subtotal, taxAmount, total } = computeTotals(lineItems, taxRate);
  const totalsX = width - margin - 200;
  const totalLine = (label: string, value: string, big = false) => {
    page.drawText(label, { x: totalsX, y, size: big ? 12 : 10.5, font: big ? bold : font, color: big ? INK : MUTED });
    page.drawText(value, { x: cols.total, y, size: big ? 12 : 10.5, font: big ? bold : font, color: INK });
    y -= big ? 22 : 17;
  };
  totalLine('Sous-total', money(subtotal));
  if (taxRate) totalLine(`TVA (${taxRate}%)`, money(taxAmount));
  totalLine('Total', money(total), true);

  if (notes) {
    y -= 20;
    page.drawText('NOTES', { x: margin, y, size: 9, font: bold, color: GOLD });
    y -= 16;
    for (const line of notes.split('\n').slice(0, 20)) {
      page.drawText(line.slice(0, 100), { x: margin, y, size: 10, font, color: MUTED, maxWidth: width - margin * 2 });
      y -= 14;
    }
  }

  // Legal footer — pinned to the bottom of the page, independent of how far the content above grew.
  const footerSize = 7.5;
  const footerLineHeight = 11;
  let footerY = margin - 6 + LEGAL_FOOTER.length * footerLineHeight;
  page.drawLine({ start: { x: margin, y: footerY + 6 }, end: { x: width - margin, y: footerY + 6 }, thickness: 0.75, color: RULE });
  for (const line of LEGAL_FOOTER) {
    const text = winAnsiSafe(line);
    const textWidth = font.widthOfTextAtSize(text, footerSize);
    page.drawText(text, { x: (width - textWidth) / 2, y: footerY, size: footerSize, font, color: MUTED });
    footerY -= footerLineHeight;
  }

  return pdf.save();
}
