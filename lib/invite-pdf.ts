'use client';
// Browser-side wrapper: fetches the studio logo and hands it to the shared (isomorphic) PDF
// builder. The password never has to be sent back over the network to get it into this PDF.
import { buildInvitePdf as buildInvitePdfCore } from '@/lib/invite-pdf-core';

export async function buildInvitePdf(args: {
  name: string;
  roleLabel: string;
  email: string;
  temporaryPassword: string;
  url: string;
  studioName: string;
}): Promise<Uint8Array> {
  const logoPngBytes = await fetch('/the-one-core-logo-pdf.png')
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null);
  return buildInvitePdfCore({ ...args, logoPngBytes });
}

/** Triggers a browser download of the generated PDF bytes. */
export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
