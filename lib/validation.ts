import { z } from 'zod';
import { statuses, channels, libraryCategories, docTypes, docStatuses } from './model';

const httpUrl = (value: string) => {
  if (!/^https?:\/\//i.test(value)) return false;
  try { return !!new URL(value).hostname; } catch { return false; }
};
const url = z.string().max(2000).refine((v) => !v || httpUrl(v), 'Utilisez un lien http:// ou https://.');
const source = z.string().trim().max(2000).refine(
  (v) => !v || ['Réunion', 'WhatsApp', 'Contrat', 'Interne', 'Portail'].includes(v) || httpUrl(v),
  'Ajoutez un lien http:// ou https://, ou choisissez une source prédéfinie.',
);
const date = z.string().refine(
  (v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v),
  'Date invalide.',
);

export const fields = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.').max(160),
  clientId: z.string().max(100).optional(),
  projectId: z.string().max(100).optional(),
  assignee: z.string().trim().max(80).optional(),
  due: date.optional(),
  source: source.optional(),
  deliverable: url.optional(),
  description: z.string().max(15000).optional(),
  status: z.enum(statuses).optional(),
  archived: z.boolean().optional(),
  contact: z.string().max(150).optional(),
  email: z.union([z.literal(''), z.string().email()]).optional(),
  city: z.string().max(100).optional(),
  sector: z.string().max(120).optional(),
  language: z.enum(['Français', 'العربية']).optional(),
  drive: url.optional(),
  contract: url.optional(),
  channel: z.union([z.literal(''), z.enum(channels)]).optional(),
  time: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  // The One Flow
  quota: z.string().regex(/^$|^\d{1,3}$/, 'Indiquez un nombre de contenus par mois.').optional(),
  logo: z.string().regex(/^$|^[0-9a-f-]{36}$/).optional(),
  banner: z.string().regex(/^$|^[0-9a-f-]{36}$/).optional(),
  evergreen: z.boolean().optional(),
  publishable: z.boolean().optional(),
});

export const requestFields = z.object({
  name: z.string().trim().min(1, 'Donnez un titre à votre demande.').max(160),
  projectId: z.string().max(100).optional(),
  description: z.string().max(15000).optional(),
  due: date.optional(),
  channel: z.union([z.literal(''), z.enum(channels)]).optional(),
});

export const libraryFields = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.').max(160),
  category: z.enum(libraryCategories),
  content: z.string().trim().max(20000).optional(),
  link: url.optional(),
  description: z.string().max(2000).optional(),
}).refine((v) => v.category === 'prompt' ? !!v.content?.trim() : !!v.link?.trim(),
  { message: 'Un prompt a besoin d’un texte ; les autres catégories, d’un lien.', path: ['content'] });

export const documentFields = z.object({
  docType: z.enum(docTypes),
  clientId: z.string().max(100),
  name: z.string().trim().max(160).optional(),
  docStatus: z.enum(docStatuses).optional(),
  lineItems: z.array(z.object({
    description: z.string().trim().min(1).max(300),
    quantity: z.number().positive().max(100000),
    unitPrice: z.number().nonnegative().max(10000000),
  })).max(100).default([]),
  taxRate: z.number().min(0).max(100).optional(),
  issuedAt: date.optional(),
  dueAt: date.optional(),
  validUntil: date.optional(),
  notes: z.string().max(5000).optional(),
  archived: z.boolean().optional(),
});

export const inviteFields = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.').max(200),
  name: z.string().trim().max(120).optional(),
  role: z.enum(['admin', 'creative', 'print_operator', 'client']),
  clientId: z.string().max(100).optional(),
});
