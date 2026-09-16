export const statuses = ['À faire', 'En cours', 'À valider', 'Validé'] as const;
export const sources = ['Réunion', 'WhatsApp', 'Contrat', 'Interne', 'Portail'] as const;
export const channels = ['Instagram', 'Facebook', 'TikTok'] as const;
export type Status = typeof statuses[number];

// Immutable receipt written when a deliverable is validated (The One Flow §2.4 sign-off record).
export type SignOff = {
  mode: 'explicit' | 'silence' | 'studio';
  by: string;
  email?: string;
  at: string;
  round: number;
};

export const libraryCategories = ['prompt', 'asset', 'plugin', 'preset'] as const;
export type LibraryCategory = typeof libraryCategories[number];
export const docTypes = ['devis', 'facture', 'contract'] as const;
export type DocType = typeof docTypes[number];
export const docStatuses = ['draft', 'sent', 'accepted', 'refused', 'paid'] as const;
export type DocStatus = typeof docStatuses[number];
export type LineItem = { description: string; quantity: number; unitPrice: number };

export type RecordItem = {
  id: string;
  kind: 'client' | 'project' | 'task' | 'comment' | 'event' | 'library' | 'document';
  revision: number;
  name: string;
  clientId?: string;
  projectId?: string;
  taskId?: string;
  assignee?: string;
  assigneeId?: string; // stable identity; display-name changes never alter access
  due?: string;
  source?: string;
  deliverable?: string;
  description?: string;
  status?: Status;
  archived?: boolean;
  contact?: string;
  email?: string;
  city?: string;
  sector?: string;
  language?: string;
  drive?: string;
  contract?: string;
  channel?: string;
  time?: string;
  author?: string;
  createdAt: string;
  sentAt?: string;
  validatedAt?: string;
  demo?: boolean;
  history?: { text: string; date: string }[];
  // The One Flow fields
  quota?: string;              // client: items sold per month
  logo?: string;               // client: asset id (see /api/assets)
  banner?: string;             // client: asset id
  approvalDueAt?: string;      // task: stored end of the 48h clock, never recomputed
  revisionRound?: number;      // task: client "request changes" rounds used
  signOff?: SignOff;           // task: validation receipt
  publishedAt?: string;        // task: when the item actually went out
  evergreen?: boolean;         // task: undated reserve item
  publishable?: boolean;       // task: false for internal work (copywriting, prémontage…) that is never published
  lockOverride?: boolean;      // task: created/re-dated inside J−7 by an admin
  reminders?: string[];        // task: reminder keys already emitted
  request?: { by: string; email?: string; at: string }; // task: came from the portal request form
  // event fields
  type?: 'reminder' | 'auto-approved' | 'sweep' | 'lock' | 'request' | 'decision' | 'client-added' | 'task-assigned';
  audience?: 'studio' | 'client' | 'both';
  read?: boolean;
  // library fields — internal resources, every studio role (owner/admin/creative/viewer), never the client
  category?: LibraryCategory;
  content?: string;   // prompt text (category === 'prompt')
  link?: string;       // external URL for asset/plugin/preset (category !== 'prompt')
  // document fields (devis/facture/contract) — owner + that document's own client only
  docType?: DocType;
  number?: string;      // immutable once created, e.g. "FACTURE-2026-0001"
  seq?: number;          // raw per-docType-per-year sequence backing `number`
  docStatus?: DocStatus;
  issuedAt?: string;
  dueAt?: string;         // facture: payment due date
  validUntil?: string;    // devis/contract: offer validity date
  lineItems?: LineItem[];
  taxRate?: number;       // percentage
  notes?: string;
};
export function initials(name:string){return name.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();}
export function dayKey(d:Date){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function safeLink(v:string){try {const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}}
export function sampleRecords():RecordItem[]{
 const now=new Date();const createdAt=now.toISOString();const date=(offset:number)=>{const d=new Date(now);d.setDate(d.getDate()+offset);return dayKey(d)};
 const clients=[['Maison Noya','Art de vivre & décoration','Casablanca'],['Studio Forma','Architecture & design','Rabat'],['Café Atlas','Restauration','Tanger'],['Luma Skincare','Beauté & soin','Marrakech']];
 const result:RecordItem[]=clients.map(([name,sector,city],i)=>({id:`demo-c${i}`,kind:'client',revision:1,name,sector,city,description:'Une marque singulière, une communication soignée. Construire une présence claire et cohérente, de l’identité aux contenus.',contact:'Contact à renseigner',email:'',language:i===2?'العربية':'Français',quota:['12','8','16','10'][i],createdAt,demo:true}));
 clients.forEach((c,i)=>result.push({id:`demo-p${i}`,kind:'project',revision:1,name:i===1?'Identité de marque':'Communication · Septembre',clientId:`demo-c${i}`,description:i===1?'Une identité claire, du logo aux applications.':'Création et suivi des contenus du mois.',createdAt,demo:true}));
 const names=['Carrousel — La nouvelle collection','Reel — Les coulisses de l’atelier','Déclinaisons du logotype','Stories — Le rituel du matin','Affiche — Brunch du dimanche','Moodboard — Direction artistique','Post — Ingrédient à la une','Bannière — Nouvelle carte','Guide — Les usages du logo','Carrousel — Notre savoir-faire','Visuels — Lancement de la gamme','Stories — Questions & réponses'];
 const cs=[0,0,1,3,2,1,3,2,1,0,3,2],ss:Status[]=['En cours','À faire','À valider','En cours','À valider','Validé','À faire','En cours','Validé','À faire','À valider','En cours'];
 const offsets=[-1,9,8,3,2,-3,12,10,-4,6,3,5];
 names.forEach((name,i)=>{
  const status=ss[i];
  const sentAt=status==='À valider'?new Date(now.getTime()-[30,20,46][i%3]*3600*1000).toISOString():status==='Validé'?new Date(now.getTime()-5*24*3600*1000).toISOString():undefined;
  const approvalDueAt=sentAt&&status==='À valider'?new Date(new Date(sentAt).getTime()+48*3600*1000).toISOString():undefined;
  const evergreen=i===5;
  result.push({id:`demo-t${i}`,kind:'task',revision:1,name,clientId:`demo-c${cs[i]}`,projectId:`demo-p${cs[i]}`,assignee:['Safwane','Yasmine','Amine'][i%3],due:evergreen?'':date(offsets[i]),source:sources[i%4],status,deliverable:['À valider','Validé'].includes(status)?'/demo-deliverable.html':'',description:'Créer un contenu fidèle à l’identité de la marque.\n\n• Hiérarchiser le message principal\n• Prévoir les déclinaisons nécessaires\n• Vérifier les textes et les marges\n• Fournir un fichier prêt à valider',createdAt,sentAt,approvalDueAt,validatedAt:status==='Validé'?new Date(now.getTime()-4*24*3600*1000).toISOString():undefined,revisionRound:[0,0,1,0,2,0,0,1,0,0,1,0][i],signOff:status==='Validé'?{mode:i===8?'silence':'explicit',by:i===8?'Validation tacite':'Contact client',at:new Date(now.getTime()-4*24*3600*1000).toISOString(),round:0}:undefined,publishedAt:i===8?new Date(now.getTime()-4*24*3600*1000).toISOString():undefined,evergreen,channel:i%3===0?'Instagram':i%3===1?'TikTok':'Facebook',time:'10:00',demo:true,history:[{text:'Tâche d’exemple créée',date:createdAt}]});
 });
 return result;
}
