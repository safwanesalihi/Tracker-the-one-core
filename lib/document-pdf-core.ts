import { PDFDocument, StandardFonts, rgb, LineCapStyle } from 'pdf-lib';
import { computeTotals, docLabels } from '@/lib/documents';

const hexToRgb = (hex: string) => {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return rgb(((bigint >> 16) & 255) / 255, ((bigint >> 8) & 255) / 255, (bigint & 255) / 255);
};

const DARK = hexToRgb('#0F0F12');
const GOLD = hexToRgb('#B8962E');
const GOLD_LIGHT = hexToRgb('#E8C76F');
const GOLD_DEEP = hexToRgb('#8E6928');
const BEIGE = hexToRgb('#FBFAF6');
const BEIGE_DARK = hexToRgb('#F5EDD8');
const INK = hexToRgb('#14171F');
const MUTED = hexToRgb('#6B7280');
const RULE = hexToRgb('#F0EBE0');
const WHITE = rgb(1, 1, 1);
const GOLD_BG = rgb(249/255, 245/255, 233/255); // very light gold for TVA

const winAnsiSafe = (text: string) => text.replace(/[   ]/g, ' ');
const money = (value: number) => winAnsiSafe(`${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dateFr = (value?: string) => value ? winAnsiSafe(new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })) : '—';

interface PdfOptions {
  docType: string;
  number: string;
  docStatus?: string;
  studioName: string;
  clientName: string;
  issuedAt?: string;
  dueAt?: string;
  validUntil?: string;
  lineItems: { description: string, quantity: number, unitPrice: number }[];
  taxRate?: string | number;
  notes?: string;
  logoPngBytes?: Uint8Array;
  counterparty?: string;
}

export async function buildDocumentPdf({
  docType, number, docStatus: _docStatus, studioName, clientName, issuedAt, dueAt, validUntil: _validUntil,
  lineItems, taxRate, notes, logoPngBytes, counterparty
}: PdfOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 32;

  // Header
  const headerHeight = 110;
  page.drawRectangle({ x: 0, y: height - headerHeight, width, height: headerHeight, color: DARK });
  
  if (logoPngBytes) {
    try {
      const logo = await pdf.embedPng(logoPngBytes);
      const logoWidth = 140;
      const logoHeight = (logo.height / logo.width) * logoWidth;
      page.drawImage(logo, { x: margin, y: height - headerHeight / 2 - logoHeight / 2 + 8, width: logoWidth, height: logoHeight });
    } catch {
      page.drawText(studioName, { x: margin, y: height - headerHeight / 2, size: 20, font: bold, color: WHITE });
    }
  } else {
    page.drawText(studioName, { x: margin, y: height - headerHeight / 2, size: 20, font: bold, color: WHITE });
  }

  // Header right: Title and Pill
  const title = docLabels[docType as keyof typeof docLabels]?.toUpperCase() || 'FACTURE';
  const titleWidth = bold.widthOfTextAtSize(title, 22);
  const titleY = height - 48;
  page.drawText(title, { x: width - margin - titleWidth, y: titleY, size: 22, font: bold, color: GOLD_LIGHT });
  
  const numText = `N°  ${number}`;
  const numWidth = bold.widthOfTextAtSize(numText, 10);
  const pillWidth = numWidth + 24;
  const pillHeight = 22;
  const pillX = width - margin - pillWidth;
  const pillY = titleY - 30;
  
  const r = 11;
  const path = `M ${pillX + r} ${pillY} L ${pillX + pillWidth - r} ${pillY} A ${r} ${r} 0 0 1 ${pillX + pillWidth} ${pillY + r} L ${pillX + pillWidth} ${pillY + pillHeight - r} A ${r} ${r} 0 0 1 ${pillX + pillWidth - r} ${pillY + pillHeight} L ${pillX + r} ${pillY + pillHeight} A ${r} ${r} 0 0 1 ${pillX} ${pillY + pillHeight - r} L ${pillX} ${pillY + r} A ${r} ${r} 0 0 1 ${pillX + r} ${pillY} Z`;
  page.drawSvgPath(path, { borderColor: hexToRgb('#E8C76F'), borderWidth: 1 });
  page.drawText(numText, { x: pillX + 12, y: pillY + 7, size: 10, font: bold, color: hexToRgb('#E8C76F') });

  // ICE / RC
  const yIce = height - headerHeight + 18;
  page.drawText("ICE:", { x: margin, y: yIce, size: 8, font: bold, color: GOLD_LIGHT });
  page.drawText(" 003921894000076  ", { x: margin + 20, y: yIce, size: 8, font, color: WHITE });
  page.drawText("·  RC:", { x: margin + 95, y: yIce, size: 8, font: bold, color: GOLD_LIGHT });
  page.drawText(" 27375", { x: margin + 125, y: yIce, size: 8, font, color: WHITE });

  let y = height - headerHeight - 36;

  // FACTURE A Block
  const leftBoxW = 310;
  const leftBoxH = 100;
  const dR = 8;
  const lPath = `M ${margin + dR} ${y - leftBoxH} L ${margin + leftBoxW - dR} ${y - leftBoxH} A ${dR} ${dR} 0 0 1 ${margin + leftBoxW} ${y - leftBoxH + dR} L ${margin + leftBoxW} ${y - dR} A ${dR} ${dR} 0 0 1 ${margin + leftBoxW - dR} ${y} L ${margin + dR} ${y} A ${dR} ${dR} 0 0 1 ${margin} ${y - dR} L ${margin} ${y - leftBoxH + dR} A ${dR} ${dR} 0 0 1 ${margin + dR} ${y - leftBoxH} Z`;
  page.drawSvgPath(lPath, { color: BEIGE, borderColor: hexToRgb('#E6DFCC'), borderWidth: 1 });
  
  page.drawLine({ start: { x: margin + 16, y: y - 16 }, end: { x: margin + 40, y: y - 16 }, thickness: 2, color: GOLD });
  page.drawText(`FACTURÉ À`, { x: margin + 16, y: y - 34, size: 9, font: bold, color: GOLD_DEEP });
  
  const cpLines = (counterparty || clientName || "—").split('\n');
  const nom = cpLines[0] || "—";
  const address = cpLines.slice(1).join(', ') || "—";

  page.drawText("Nom : ", { x: margin + 16, y: y - 56, size: 10, font: bold, color: MUTED });
  page.drawText(nom.slice(0, 40), { x: margin + 50, y: y - 56, size: 10, font: bold, color: INK });
  page.drawText("Adresse : ", { x: margin + 16, y: y - 76, size: 10, font: bold, color: MUTED });
  page.drawText(address.slice(0, 40), { x: margin + 65, y: y - 76, size: 10, font: bold, color: INK });

  // DATES Block
  const rightBoxW = 180;
  const rightBoxH = 100;
  const dX = width - margin - rightBoxW;
  const dY = y - rightBoxH;
  const dPath = `M ${dX + dR} ${dY} L ${dX + rightBoxW - dR} ${dY} A ${dR} ${dR} 0 0 1 ${dX + rightBoxW} ${dY + dR} L ${dX + rightBoxW} ${dY + rightBoxH - dR} A ${dR} ${dR} 0 0 1 ${dX + rightBoxW - dR} ${dY + rightBoxH} L ${dX + dR} ${dY + rightBoxH} A ${dR} ${dR} 0 0 1 ${dX} ${dY + rightBoxH - dR} L ${dX} ${dY + dR} A ${dR} ${dR} 0 0 1 ${dX + dR} ${dY} Z`;
  page.drawSvgPath(dPath, { color: DARK });
  
  page.drawText("DATES", { x: dX + 16, y: dY + rightBoxH - 24, size: 9, font: bold, color: GOLD_LIGHT });
  page.drawText("Émise le", { x: dX + 16, y: dY + rightBoxH - 52, size: 10, font: bold, color: WHITE });
  page.drawText(dateFr(issuedAt), { x: dX + rightBoxW - 16 - font.widthOfTextAtSize(dateFr(issuedAt), 10), y: dY + rightBoxH - 52, size: 10, font: bold, color: GOLD_LIGHT });
  
  if (docType === 'facture' || dueAt) {
    page.drawText("Échéance", { x: dX + 16, y: dY + rightBoxH - 72, size: 10, font: bold, color: WHITE });
    page.drawText(dateFr(dueAt), { x: dX + rightBoxW - 16 - font.widthOfTextAtSize(dateFr(dueAt), 10), y: dY + rightBoxH - 72, size: 10, font: bold, color: GOLD_LIGHT });
  }

  y -= (leftBoxH + 28);

  // Table
  const cols = { desc: margin + 16, qty: width - margin - 220, unit: width - margin - 150, total: width - margin - 60 };
  
  // Header row
  const thPath = `M ${margin} ${y - 32} L ${width - margin} ${y - 32} L ${width - margin} ${y} L ${margin} ${y} Z`;
  page.drawSvgPath(thPath, { color: GOLD }); // Used GOLD to represent the gradient
  page.drawText("DESCRIPTION", { x: cols.desc, y: y - 19, size: 9, font: bold, color: DARK });
  const qTitle = "QTÉ";
  page.drawText(qTitle, { x: cols.qty + 10 - bold.widthOfTextAtSize(qTitle, 9)/2, y: y - 19, size: 9, font: bold, color: DARK });
  const uTitle = "PRIX UNIT. MAD";
  page.drawText(uTitle, { x: cols.unit + 35 - bold.widthOfTextAtSize(uTitle, 9)/2, y: y - 19, size: 9, font: bold, color: DARK });
  const tmStr = "TOTAL MAD";
  page.drawText(tmStr, { x: width - margin - 16 - bold.widthOfTextAtSize(tmStr, 9), y: y - 19, size: 9, font: bold, color: DARK });

  y -= 32;

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    const lineTotal = item.quantity * item.unitPrice;
    
    // Alternating bg
    if (i % 2 === 0) {
      page.drawRectangle({ x: margin, y: y - 36, width: width - margin * 2, height: 36, color: WHITE });
    } else {
      page.drawRectangle({ x: margin, y: y - 36, width: width - margin * 2, height: 36, color: BEIGE });
    }
    
    page.drawText(item.description.slice(0, 70), { x: cols.desc, y: y - 21, size: 10, font, color: INK, maxWidth: cols.qty - cols.desc - 10 });
    
    const qStr = String(item.quantity);
    page.drawText(qStr, { x: cols.qty + 10 - font.widthOfTextAtSize(qStr, 10)/2, y: y - 21, size: 10, font, color: MUTED });
    
    const uStr = money(item.unitPrice);
    page.drawText(uStr, { x: cols.unit + 35 - font.widthOfTextAtSize(uStr, 10)/2, y: y - 21, size: 10, font, color: MUTED });
    
    const tStr = money(lineTotal);
    page.drawText(tStr, { x: width - margin - 16 - bold.widthOfTextAtSize(tStr, 10), y: y - 21, size: 10, font: bold, color: INK });
    
    y -= 36;
    if (i !== lineItems.length - 1) {
      page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: RULE });
    }
  }

  y -= 28;

  // Notes and Totals
  const { subtotal, total, taxAmount } = computeTotals(lineItems, taxRate);
  
  // NOTE block
  const nW = width - margin*2 - 250;
  const nH = 110;
  // Left border thick line
  page.drawRectangle({ x: margin, y: y - nH, width: nW, height: nH, color: BEIGE });
  page.drawRectangle({ x: margin, y: y - nH, width: 3, height: nH, color: GOLD });
  
  page.drawText("NOTE", { x: margin + 16, y: y - 22, size: 9, font: bold, color: GOLD_DEEP });
  page.drawText(notes ? notes.slice(0, 150) : "Merci pour votre confiance.", { x: margin + 16, y: y - 40, size: 9, font, color: INK, maxWidth: nW - 24 });
  page.drawText("CONDITIONS DE PAIEMENT", { x: margin + 16, y: y - 65, size: 9, font: bold, color: GOLD_DEEP });
  page.drawText("Paiement par virement ou espèces.", { x: margin + 16, y: y - 80, size: 9, font, color: INK });
  page.drawText("RIB : 007 621 0002585000000836 42", { x: margin + 16, y: y - 92, size: 9, font, color: INK });


  // Totals block
  const tX = width - margin - 220;
  const tW = 220;
  
  page.drawRectangle({ x: tX, y: y - 36, width: tW, height: 36, color: BEIGE }); 
  page.drawText("SOUS-TOTAL", { x: tX + 16, y: y - 22, size: 9, font: bold, color: MUTED });
  const stStr = `${money(subtotal)} MAD`;
  page.drawText(stStr, { x: tX + tW - 16 - bold.widthOfTextAtSize(stStr, 11), y: y - 23, size: 11, font: bold, color: INK });

  y -= 40;
  const hasVat = !!(taxRate && taxRate > 0);
  if (hasVat) {
    page.drawRectangle({ x: tX, y: y - 36, width: tW, height: 36, color: GOLD_BG }); 
    page.drawText(`TVA (${taxRate}%)`, { x: tX + 16, y: y - 22, size: 9, font: bold, color: GOLD_DEEP });
    const taxStr = `${money(taxAmount)} MAD`;
    page.drawText(taxStr, { x: tX + tW - 16 - bold.widthOfTextAtSize(taxStr, 11), y: y - 23, size: 11, font: bold, color: INK });
    y -= 40;
  }

  // Total TTC
  page.drawRectangle({ x: tX, y: y - 48, width: tW, height: 48, color: DARK });
  page.drawLine({ start: { x: tX, y }, end: { x: tX + tW, y }, thickness: 2, color: GOLD_LIGHT });
  page.drawText("TOTAL TTC", { x: tX + 16, y: y - 28, size: 9, font: bold, color: rgb(1,1,1) });
  const ttStr = `${money(total)}`;
  const mStr = " MAD";
  const ttW = bold.widthOfTextAtSize(ttStr, 16);
  const mW = bold.widthOfTextAtSize(mStr, 12);
  page.drawText(ttStr, { x: tX + tW - 16 - ttW - mW, y: y - 30, size: 16, font: bold, color: GOLD_LIGHT });
  page.drawText(mStr, { x: tX + tW - 16 - mW, y: y - 30, size: 12, font: bold, color: GOLD_LIGHT });

  // Footer
  const footerH = 46;
  page.drawRectangle({ x: 0, y: 0, width, height: footerH, color: DARK });
  page.drawLine({ start: { x: margin, y: footerH }, end: { x: width - margin, y: footerH }, thickness: 1, color: GOLD });
  const fY = 18;
  
  // Phone SVG
  page.drawSvgPath("M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z", 
    { x: 42, y: fY + 12, scale: 0.4, color: GOLD_LIGHT });
  page.drawText("+212 6 07 48 48 22", { x: 58, y: fY, size: 9, font, color: WHITE });
  
  // Mail SVG
  page.drawSvgPath("M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6", 
    { x: 175, y: fY + 12, scale: 0.4, borderColor: GOLD_LIGHT, borderWidth: 1.5 });
  page.drawText("contact@the1core.com", { x: 190, y: fY, size: 9, font, color: WHITE });
  
  // Pin SVG
  page.drawSvgPath("M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", 
    { x: 335, y: fY + 12, scale: 0.4, borderColor: GOLD_LIGHT, borderWidth: 1.5 });
  page.drawText("Berrechid, Maroc", { x: 350, y: fY, size: 9, font, color: WHITE });
  
  // Web SVG
  page.drawSvgPath("M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z", 
    { x: 460, y: fY + 12, scale: 0.4, borderColor: GOLD_LIGHT, borderWidth: 1.5 });
  page.drawText("the1core.com", { x: 475, y: fY, size: 9, font, color: WHITE });

  return pdf.save();
}
