'use client';
// Browser-side wrapper: fetches the studio logo and hands it to the shared (isomorphic) PDF
// builder — same pattern as lib/invite-pdf.ts.
import { buildDocumentPdf as buildDocumentPdfCore } from '@/lib/document-pdf-core';
import type { DocStatus, DocType, LineItem } from '@/lib/model';

export async function buildDocumentPdf(args: {
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
}): Promise<Uint8Array> {
  const logoPngBytes = await fetch('/the-one-core-logo-pdf.png')
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null);
  return buildDocumentPdfCore({ ...args, logoPngBytes });
}

export { downloadPdf } from '@/lib/invite-pdf';
