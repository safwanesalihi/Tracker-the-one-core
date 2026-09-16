// Devis/facture/contrat pure helpers, exercised without a database.
import { strict as assert } from 'node:assert';
import { globSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const esbuildPath = globSync('node_modules/.pnpm/esbuild@*/node_modules/esbuild/lib/main.js')[0] || 'node_modules/esbuild/lib/main.js';
const esbuild = await import(pathToFileURL(esbuildPath));
mkdirSync('.sites-runtime', { recursive: true });
await esbuild.build({ entryPoints: ['lib/documents.ts'], outfile: '.sites-runtime/documents-test.mjs', bundle: true, platform: 'node', format: 'esm',
  plugins: [{ name: 'alias', setup(b) { b.onResolve({ filter: /^@\/lib\/model$/ }, () => ({ path: process.cwd() + '/lib/model.ts' })); } }] });
const { computeTotals, nextDocNumber, docPrefixes, docStatusesFor } = await import(pathToFileURL(process.cwd() + '/.sites-runtime/documents-test.mjs'));

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };

// Totals: subtotal, tax and total are always computed, never stored.
eq(computeTotals([], 20), { subtotal: 0, taxAmount: 0, total: 0 }, 'no line items means nothing due');
eq(computeTotals([{ description: 'Pack', quantity: 2, unitPrice: 500 }], 0), { subtotal: 1000, taxAmount: 0, total: 1000 }, 'no tax rate leaves the total at the subtotal');
eq(computeTotals([{ description: 'Pack', quantity: 2, unitPrice: 500 }, { description: 'Extra', quantity: 1, unitPrice: 250 }], 20), { subtotal: 1250, taxAmount: 250, total: 1500 }, 'multiple lines and a tax rate compound correctly');

// Numbering: sequential per docType, per year, independent of which client it's for.
eq(nextDocNumber([], 'devis', 2026), { seq: 1, number: 'DEVIS-2026-0001' }, 'the first devis of a fresh year starts at 0001');
eq(nextDocNumber(['DEVIS-2026-0001'], 'devis', 2026), { seq: 2, number: 'DEVIS-2026-0002' }, 'the next devis continues the sequence');
eq(nextDocNumber(['DEVIS-2026-0001', 'DEVIS-2026-0003'], 'devis', 2026), { seq: 4, number: 'DEVIS-2026-0004' }, 'a gap (e.g. a deleted draft) is not reused — the sequence always advances past the highest seen');
eq(nextDocNumber(['FACTURE-2026-0007'], 'devis', 2026), { seq: 1, number: 'DEVIS-2026-0001' }, 'numbers from a different docType are irrelevant — the caller already scopes the query by docType');
eq(nextDocNumber(['DEVIS-2026-0009'], 'devis', 2027), { seq: 1, number: 'DEVIS-2027-0001' }, 'a new year restarts the sequence at 0001');
ok(nextDocNumber([], 'facture', 2026).number.startsWith('FACTURE-'), 'facture prefix');
ok(nextDocNumber([], 'contract', 2026).number.startsWith('CONTRAT-'), 'contract prefix');

// Status sets: facture never offers "accepted"/"refused"; devis/contract never offer "paid".
ok(!docStatusesFor.facture.includes('accepted') && !docStatusesFor.facture.includes('refused'), 'a facture is never accepted or refused, only paid');
ok(!docStatusesFor.devis.includes('paid') && !docStatusesFor.contract.includes('paid'), 'a devis or contract is never marked paid');
eq(Object.keys(docPrefixes).sort(), ['contract', 'devis', 'facture'], 'exactly the three document types');

console.log(`${checks} document checks passed: totals, sequential numbering per type and year, status sets.`);
