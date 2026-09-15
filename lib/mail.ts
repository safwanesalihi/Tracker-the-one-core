// Outgoing e-mail through Gmail SMTP (App Password). When not configured, callers fall back to showing the
// information on screen so the studio can send it by hand.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '@/lib/env';
import { buildInvitePdf } from '@/lib/invite-pdf-core';

/** The studio logo, read once and cached for every PDF the server generates this instance. */
let logoBytesPromise: Promise<Uint8Array | null> | null = null;
const logoBytes = () => {
  logoBytesPromise ??= readFile(join(process.cwd(), 'public', 'the-one-core-logo-pdf.png')).catch(() => null);
  return logoBytesPromise;
};

export const mailConfigured = () => !!(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);

export type Invitation = { to: string; name: string; temporaryPassword: string; studio: string; url: string; roleLabel: string; renewal: boolean };

export function invitationMessage(i: Invitation) {
  const subject = i.renewal ? `Nouveau mot de passe temporaire — ${i.studio}` : `Votre accès à l’espace ${i.studio}`;
  const text = [
    `Bonjour ${i.name || ''},`.replace(' ,', ','),
    '',
    i.renewal
      ? `${i.studio} a renouvelé votre accès à son espace de suivi et de validation.`
      : `${i.studio} vous a ouvert un accès à son espace de suivi et de validation (${i.roleLabel}).`,
    '',
    `Adresse : ${i.url}`,
    `Identifiant : ${i.to}`,
    `Mot de passe temporaire : ${i.temporaryPassword}`,
    '',
    'À votre première connexion, vous choisirez votre propre mot de passe. Ce mot de passe temporaire ne sert qu’une fois.',
    '',
    `— ${i.studio}`,
  ].join('\n');
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#111;max-width:560px">
<p>Bonjour ${esc(i.name || '')},</p>
<p>${esc(i.renewal ? `${i.studio} a renouvelé votre accès à son espace de suivi et de validation.` : `${i.studio} vous a ouvert un accès à son espace de suivi et de validation (${i.roleLabel}).`)}</p>
<table style="border-collapse:collapse;margin:18px 0"><tr><td style="padding:6px 14px 6px 0;color:#666">Adresse</td><td><a href="${esc(i.url)}">${esc(i.url)}</a></td></tr>
<tr><td style="padding:6px 14px 6px 0;color:#666">Identifiant</td><td>${esc(i.to)}</td></tr>
<tr><td style="padding:6px 14px 6px 0;color:#666">Mot de passe temporaire</td><td><code style="font-size:16px;letter-spacing:.06em;background:#f3f3f1;border:1px solid #e5e5e0;border-radius:4px;padding:3px 8px">${esc(i.temporaryPassword)}</code></td></tr></table>
<p>À votre première connexion, vous choisirez votre propre mot de passe. Ce mot de passe temporaire ne sert qu’une fois.</p>
<p style="color:#666">— ${esc(i.studio)}</p></div>`;
  return { subject, text, html };
}

export async function sendInvitation(invitation: Invitation): Promise<{ sent: boolean; error?: string }> {
  if (!mailConfigured()) return { sent: false };
  try {
    const { default: nodemailer } = await import('nodemailer');
    const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: env.GMAIL_USER!, pass: env.GMAIL_APP_PASSWORD! } });
    const message = invitationMessage(invitation);
    // Same welcome document as the "Download as PDF" button, attached so it arrives with the e-mail too.
    const pdfBytes = await buildInvitePdf({
      name: invitation.name, roleLabel: invitation.roleLabel, email: invitation.to,
      temporaryPassword: invitation.temporaryPassword, url: invitation.url, studioName: invitation.studio,
      logoPngBytes: await logoBytes(),
    }).catch((error) => { console.error('invitation pdf', (error as Error).message); return null; });
    await transport.sendMail({
      from: `"${invitation.studio}" <${env.GMAIL_USER}>`, to: invitation.to, subject: message.subject, text: message.text, html: message.html,
      ...(pdfBytes ? { attachments: [{ filename: `acces-${invitation.studio}.pdf`, content: Buffer.from(pdfBytes), contentType: 'application/pdf' }] } : {}),
    });
    return { sent: true };
  } catch (error) {
    console.error('invitation mail', (error as Error).message);
    return { sent: false, error: 'L’envoi de l’e-mail a échoué. Transmettez le mot de passe temporaire vous-même.' };
  }
}
