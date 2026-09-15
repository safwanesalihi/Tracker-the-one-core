import { z } from 'zod';
import { statuses, channels } from './model';

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
  evergreen: z.boolean().optional(),
});

export const requestFields = z.object({
  name: z.string().trim().min(1, 'Donnez un titre à votre demande.').max(160),
  projectId: z.string().max(100).optional(),
  description: z.string().max(15000).optional(),
  due: date.optional(),
  channel: z.union([z.literal(''), z.enum(channels)]).optional(),
});

export const inviteFields = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.').max(200),
  role: z.enum(['admin', 'creative', 'viewer', 'client']),
  clientId: z.string().max(100).optional(),
});
