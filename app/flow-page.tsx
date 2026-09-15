'use client';
// Pilotage — the six numbers of The One Flow, the court overview and the alerts feed.
import { createElement, useState } from 'react';
import { AlertTriangle, Bell, BellOff, CheckCircle2, ChevronRight, Clock, Gauge, Inbox, Lock, RefreshCw, Repeat, Send, Sparkles, Timer, type LucideIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type RecordItem } from '@/lib/model';
import { computeMetrics, courtOf, flow, monthPeriod, shiftDay, type Court, type Metrics } from '@/lib/flow';

type Props = {
  records: RecordItem[];
  today: string;
  busy: boolean;
  onOpenTask: (id: string) => void;
  onOpenClient: (id: string) => void;
  onMarkRead: (ids: string[]) => Promise<void>;
  onRefresh: () => void;
};

const pct = (v: number | null) => v === null ? '—' : `${Math.round(v * 100)} %`;
const num = (v: number | null, digits = 1) => v === null ? '—' : v.toFixed(digits).replace('.', ',');
const hours = (v: number | null) => v === null ? '—' : v < 48 ? `${Math.round(v)} h` : `${(v / 24).toFixed(1).replace('.', ',')} j`;

type Tile = { label: string; value: string; target: string; ok: boolean | null; detail: string; icon: LucideIcon };

function tiles(m: Metrics): Tile[] {
  const t = flow.targets;
  return [
    { label: 'Publiés à l’heure', value: pct(m.onTimeRate), target: `≥ ${pct(t.onTimeRate)}`, ok: m.onTimeRate === null ? null : m.onTimeRate >= t.onTimeRate, detail: `${m.onTime} / ${m.published} contenus publiés`, icon: Send },
    { label: 'Délai médian de validation', value: hours(m.medianValidationHours), target: `< ${t.medianValidationHours} h`, ok: m.medianValidationHours === null ? null : m.medianValidationHours < t.medianValidationHours, detail: `${m.explicitDecisions} décision${m.explicitDecisions !== 1 ? 's' : ''} explicite${m.explicitDecisions !== 1 ? 's' : ''}`, icon: Timer },
    { label: 'Validés par silence', value: pct(m.silenceShare), target: `à surveiller > ${pct(t.silenceShare)}`, ok: m.silenceShare === null ? null : m.silenceShare <= t.silenceShare, detail: `${m.silent} / ${m.validated} validations tacites`, icon: Clock },
    { label: 'Tours de retours par contenu', value: num(m.roundsPerItem), target: `≤ ${num(t.roundsPerItem)}`, ok: m.roundsPerItem === null ? null : m.roundsPerItem <= t.roundsPerItem, detail: `${flow.maxRevisionRounds} tours inclus par contrat`, icon: Repeat },
    { label: 'Livré vs vendu', value: pct(m.deliveredVsSold), target: `${pct(t.deliveredVsSold[0])} – ${pct(t.deliveredVsSold[1])}`, ok: m.deliveredVsSold === null ? null : m.deliveredVsSold >= t.deliveredVsSold[0] && m.deliveredVsSold <= t.deliveredVsSold[1], detail: `${m.delivered} publiés pour ${m.sold} vendus`, icon: Gauge },
    { label: 'Réserve evergreen', value: num(m.evergreenPerClient), target: `≥ ${t.evergreen} par client`, ok: m.evergreenPerClient === null ? null : m.clients.every((c) => c.evergreen >= t.evergreen), detail: `${m.clients.filter((c) => c.evergreen < t.evergreen).length} client${m.clients.filter((c) => c.evergreen < t.evergreen).length !== 1 ? 's' : ''} sous la cible`, icon: Sparkles },
  ];
}

export default function FlowPage({ records, today, busy, onOpenTask, onOpenClient, onMarkRead, onRefresh }: Props) {
  const [periodKey, setPeriodKey] = useState('month');
  const period = periodKey === 'previous' ? monthPeriod(shiftDay(today.slice(0, 8) + '01', -1)) : periodKey === '30' ? { from: shiftDay(today, -29), to: today } : monthPeriod(today);
  const metrics = computeMetrics(records, period);
  const clients = records.filter((r) => r.kind === 'client' && !r.archived);
  const parent = (id?: string) => records.find((r) => r.id === id);
  const tasks = records.filter((r) => r.kind === 'task' && !r.archived && !parent(r.clientId)?.archived && !parent(r.projectId)?.archived);
  const byCourt = (court: Court) => tasks.filter((t) => courtOf(t) === court);
  const events = records.filter((r) => r.kind === 'event' && r.audience !== 'client').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unread = events.filter((e) => !e.read);
  const requests = tasks.filter((t) => t.request && t.status === 'À faire');
  const overBudget = tasks.filter((t) => (t.revisionRound ?? 0) > flow.maxRevisionRounds && t.status !== 'Validé');
  const cname = (id?: string) => clients.find((c) => c.id === id)?.name || 'Client';
  const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const label = (type?: RecordItem['type']) => type === 'auto-approved' ? 'Validation tacite' : type === 'reminder' ? 'Rappel client' : type === 'sweep' ? 'Balayage J−1' : type === 'lock' ? 'Verrou J−7' : type === 'request' ? 'Demande' : 'Décision';
  const Icon = (type?: RecordItem['type']) => type === 'auto-approved' ? CheckCircle2 : type === 'reminder' ? Bell : type === 'sweep' ? AlertTriangle : type === 'lock' ? Lock : type === 'request' ? Inbox : Send;
  const periodLabel = `${new Date(period.from + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} → ${new Date(period.to + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return <div className="flow-page">
    <div className="page-heading"><span className="page-symbol" aria-hidden="true"><Gauge size={22} /></span><div className="heading-line"><h1>Pilotage</h1><div className="inline"><Tabs value={periodKey} onValueChange={setPeriodKey}><TabsList><TabsTrigger value="month">Ce mois</TabsTrigger><TabsTrigger value="previous">Mois précédent</TabsTrigger><TabsTrigger value="30">30 jours</TabsTrigger></TabsList></Tabs><button className="btn" disabled={busy} onClick={onRefresh}><RefreshCw size={15} />Actualiser</button></div></div><p>Les six nombres de The One Flow · {periodLabel}</p></div>

    <div className="flow-tiles">{tiles(metrics).map((tile) => <div className={`flow-tile ${tile.ok === null ? '' : tile.ok ? 'ok' : 'warn'}`} key={tile.label}><div className="metric-label"><span>{tile.label}</span><span className="metric-icon">{createElement(tile.icon, { size: 18 })}</span></div><strong>{tile.value}</strong><small>{tile.detail}</small><span className="flow-target">Cible {tile.target}</span></div>)}</div>

    <div className="flow-grid">
      <section className="work-panel">
        <div className="section-head"><div><h2>Dans quel camp ?<span className="neutral-badge">{tasks.filter((t) => courtOf(t) !== 'done').length}</span></h2><p>Qui doit agir maintenant, tâche par tâche.</p></div></div>
        <div className="flow-courts">{(['studio', 'client', 'done'] as Court[]).map((court) => <div key={court}><span className={`court ${court}`}><i />{court === 'studio' ? 'Studio' : court === 'client' ? 'Client' : 'Terminé'}</span><strong>{byCourt(court).length}</strong></div>)}</div>
        <div className="task-rows">{byCourt('client').slice(0, 8).map((t) => <button className="task-line" key={t.id} onClick={() => onOpenTask(t.id)}><span className="task-line-icon"><Clock size={16} /></span><span className="task-line-name"><strong>{t.name}</strong><small>{cname(t.clientId)} · validation tacite le {t.approvalDueAt ? when(t.approvalDueAt) : '—'}</small></span><span className="court client"><i />Client</span><ChevronRight size={15} /></button>)}{!byCourt('client').length && <p className="small-note flow-empty">Rien n’attend le client.</p>}</div>
        {!!overBudget.length && <div className="flow-warning"><AlertTriangle size={15} /><span>{overBudget.length} contenu{overBudget.length > 1 ? 's' : ''} hors forfait (plus de {flow.maxRevisionRounds} tours). Accord du propriétaire requis avant reprise.</span></div>}
      </section>

      <section className="review-panel">
        <div className="section-head"><div><h2>Alertes & rappels</h2><p>Validations tacites, balayage J−1, verrou J−7, demandes.</p></div>{!!unread.length && <button className="btn" disabled={busy} onClick={() => void onMarkRead(unread.map((e) => e.id))}><BellOff size={14} />Tout marquer lu</button>}</div>
        <div className="flow-feed">{events.slice(0, 30).map((e) => { return <button key={e.id} className={`flow-event ${e.read ? 'read' : ''} ${e.type}`} onClick={() => { if (e.taskId) onOpenTask(e.taskId); if (!e.read) void onMarkRead([e.id]); }}><span className="flow-event-icon">{createElement(Icon(e.type), { size: 15 })}</span><span><small>{label(e.type)} · {when(e.createdAt)}</small><strong>{e.name}</strong></span></button>; })}{!events.length && <p className="small-note flow-empty">Aucune alerte. Les horloges tournent.</p>}</div>
      </section>
    </div>

    <section className="flow-table">
      <div className="section-head"><div><h2>Par client</h2><p>Vendu, livré et réserve evergreen sur la période.</p></div>{!!requests.length && <span className="neutral-badge">{requests.length} demande{requests.length > 1 ? 's' : ''} à planifier</span>}</div>
      <div className="table-area"><Table><TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Vendu / mois</TableHead><TableHead>Publiés</TableHead><TableHead>Livré vs vendu</TableHead><TableHead>Chez le client</TableHead><TableHead>Réserve evergreen</TableHead></TableRow></TableHeader>
        <TableBody>{metrics.clients.map((c) => <TableRow key={c.clientId}><TableCell><button className="table-name" onClick={() => onOpenClient(c.clientId)}>{c.name}</button></TableCell><TableCell>{c.quota ?? <span className="small-note">À renseigner</span>}</TableCell><TableCell>{c.delivered}</TableCell><TableCell className={c.ratio !== null && (c.ratio < flow.targets.deliveredVsSold[0] || c.ratio > flow.targets.deliveredVsSold[1]) ? 'overdue' : ''}>{pct(c.ratio)}</TableCell><TableCell>{byCourt('client').filter((t) => t.clientId === c.clientId).length}</TableCell><TableCell className={c.evergreen < flow.targets.evergreen ? 'overdue' : ''}>{c.evergreen} / {flow.targets.evergreen}</TableCell></TableRow>)}</TableBody></Table></div>
      {!clients.length && <p className="small-note flow-empty">Ajoutez un client pour suivre ces nombres.</p>}
    </section>

    <section className="flow-rules">
      <h3>LES RÈGLES EN VIGUEUR</h3>
      <div className="flow-rules-grid">
        <div><strong>{flow.validationHours} h</strong><p>Validation client. Le silence vaut validation ; rappels à {flow.reminderHoursLeft.join(' h et ')} h restantes.</p></div>
        <div><strong>{flow.maxRevisionRounds} tours</strong><p>Retours consolidés inclus. Le tour {flow.maxRevisionRounds + 1} est hors forfait et demande l’accord du propriétaire.</p></div>
        <div><strong>J−{flow.lockDays}</strong><p>Calendrier gelé. Créer ou déplacer un contenu dans la semaine demande la levée du verrou par un administrateur.</p></div>
        <div><strong>{flow.gates.map((g) => `J−${g.offset}`).join(' · ')}</strong><p>Les quatre jalons de chaque contenu : {flow.gates.map((g) => g.label.toLowerCase()).join(', ')}.</p></div>
        <div><strong>{flow.evergreenTarget} evergreen</strong><p>Contenus validés, sans date, prêts à combler un trou dans le calendrier de chaque client.</p></div>
        <div><strong>Un seul canal</strong><p>Retours et validations passent par le portail. Aucun message externe n’est envoyé automatiquement.</p></div>
      </div>
    </section>
  </div>;
}
