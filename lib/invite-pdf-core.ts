// The one-page welcome document handed to a new (or reset) access: studio letterhead, the site
// link, their login and temporary password. Isomorphic (no DOM/fetch): the caller supplies the
// logo bytes, so this same drawing code runs both in the browser (download button) and on the
// server (e-mail attachment).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const DARK = rgb(0x11 / 255, 0x11 / 255, 0x11 / 255);
const GOLD = rgb(0xe5 / 255, 0xa9 / 255, 0x3c / 255);
const INK = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.88, 0.88, 0.88);

export async function buildInvitePdf({
  name,
  roleLabel,
  email,
  temporaryPassword,
  url,
  studioName,
  logoPngBytes,
}: {
  name: string;
  roleLabel: string;
  email: string;
  temporaryPassword: string;
  url: string;
  studioName: string;
  logoPngBytes?: Uint8Array | ArrayBuffer | null;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;

  const headerHeight = 130;
  page.drawRectangle({ x: 0, y: height - headerHeight, width, height: headerHeight, color: DARK });
  if (logoPngBytes) {
    try {
      const logo = await pdf.embedPng(logoPngBytes);
      const logoWidth = 190;
      const logoHeight = (logo.height / logo.width) * logoWidth;
      page.drawImage(logo, { x: margin, y: height - headerHeight / 2 - logoHeight / 2, width: logoWidth, height: logoHeight });
    } catch {
      page.drawText(studioName, { x: margin, y: height - headerHeight / 2 - 8, size: 22, font: bold, color: rgb(1, 1, 1) });
    }
  } else {
    page.drawText(studioName, { x: margin, y: height - headerHeight / 2 - 8, size: 22, font: bold, color: rgb(1, 1, 1) });
  }

  let y = height - headerHeight - 56;
  page.drawText('Bienvenue !', { x: margin, y, size: 27, font: bold, color: INK });
  y -= 30;
  page.drawText(`${name}, votre accès à l’espace ${studioName} est prêt.`, { x: margin, y, size: 12.5, font, color: MUTED });
  y -= 18;
  page.drawText(`Rôle : ${roleLabel}`, { x: margin, y, size: 12.5, font, color: MUTED });
  y -= 46;

  const field = (label: string, value: string) => {
    page.drawText(label, { x: margin, y, size: 9, font: bold, color: GOLD });
    y -= 17;
    page.drawText(value, { x: margin, y, size: 14, font, color: INK });
    y -= 32;
  };
  field('ADRESSE DU SITE', url);
  field('IDENTIFIANT', email);
  field('MOT DE PASSE TEMPORAIRE', temporaryPassword);

  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: RULE });
  y -= 26;
  page.drawText('À la première connexion, vous choisirez votre propre mot de passe.', { x: margin, y, size: 11, font, color: MUTED });
  y -= 16;
  page.drawText('Ce mot de passe temporaire ne s’affiche qu’une fois : conservez ce document', { x: margin, y, size: 10, font, color: MUTED });
  y -= 13;
  page.drawText('en lieu sûr jusqu’à votre première connexion, puis vous pourrez le détruire.', { x: margin, y, size: 10, font, color: MUTED });

  return pdf.save();
}
