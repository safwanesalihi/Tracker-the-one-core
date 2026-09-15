'use client';
// Pilotage — the six numbers of The One Flow, the court overview and the alerts feed.
import { createElement, useState } from 'react';
import { AlertTriangle, Bell, BellOff, CheckCircle2, ChevronRight, Clock, Gauge, Inbox, Lock, RefreshCw, Repeat, Send, Sparkles, Timer, type LucideIcon } from 'lucide-react';
import { useI18n } from '@/app/locale-provider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type RecordItem } from '@/lib/model';
import { computeMetrics, courtOf, dayIn, flow, monthPeriod, shiftDay, type Court, type Metrics } from '@/lib/flow';
import { DonutStat, TrendArea, BarCompare, type Slice } from '@/components/dashboard-charts';

type Props = {
  records: RecordItem[];
  today: string;
  busy: boolean;
  onOpenTask: (id: string) => void;
  onOpenClient: (id: string) => void;
  onMarkRead: (ids: string[]) => Promise<void>;
  onRefresh: () => void;
};

type T = (text: string, vars?: Record<string, string | number>) => string;
const pct = (v: number | null) => v === null ? '—' : `${Math.round(v * 100)} %`;
const num = (v: number | null, digits = 1) => v === null ? '—' : v.toFixed(digits).replace('.', ',');
const hours = (v: number | null, t: T) => v === null ? '—' : v < 48 ? t('{n} h', { n: Math.round(v) }) : t('{n} j', { n: (v / 24).toFixed(1).replace('.', ',') });

type Tile = { label: string; value: string; target: string; ok: boolean | null; detail: string; icon: LucideIcon };

function tiles(m: Metrics, t: T): Tile[] {
  const g = flow.targets;
  const under = m.clients.filter((c) => c.evergreen < g.evergreen).length;
  return [
    { label: t('Publiés à l’heure'), value: pct(m.onTimeRate), target: `≥ ${pct(g.onTimeRate)}`, ok: m.onTimeRate === null ? null : m.onTimeRate >= g.onTimeRate, detail: t('{a} / {b} contenus publiés', { a: m.onTime, b: m.published }), icon: Send },
    { label: t('Délai médian de validation'), value: hours(m.medianValidationHours, t), target: `< ${g.medianValidationHours} h`, ok: m.medianValidationHours === null ? null : m.medianValidationHours < g.medianValidationHours, detail: m.explicitDecisions === 1 ? t('1 décision explicite') : t('{n} décisions explicites', { n: m.explicitDecisions }), icon: Timer },
    { label: t('Validés par silence'), value: pct(m.silenceShare), target: t('à surveiller > {v}', { v: pct(g.silenceShare) }), ok: m.silenceShare === null ? null : m.silenceShare <= g.silenceShare, detail: t('{a} / {b} validations tacites', { a: m.silent, b: m.validated }), icon: Clock },
    { label: t('Tours de retours par contenu'), value: num(m.roundsPerItem), target: `≤ ${num(g.roundsPerItem)}`, ok: m.roundsPerItem === null ? null : m.roundsPerItem <= g.roundsPerItem, detail: t('{n} tours inclus par contrat', { n: flow.maxRevisionRounds }), icon: Repeat },
    { label: t('Livré vs vendu'), value: pct(m.deliveredVsSold), target: `${pct(g.deliveredVsSold[0])} – ${pct(g.deliveredVsSold[1])}`, ok: m.deliveredVsSold === null ? null : m.deliveredVsSold >= g.deliveredVsSold[0] && m.deliveredVsSold <= g.deliveredVsSold[1], detail: t('{a} publiés pour {b} vendus', { a: m.delivered, b: m.sold }), icon: Gauge },
    { label: t('Réserve evergreen'), value: num(m.evergreenPerClient), target: t('≥ {n} par client', { n: g.evergreen }), ok: m.evergreenPerClient === null ? null : m.clients.every((c) => c.evergreen >= g.evergreen), detail: under === 1 ? t('1 client sous la cible') : t('{n} clients sous la cible', { n: under }), icon: Sparkles },
  ];
}

export default function FlowPage({ records, today, busy, onOpenTask, onOpenClient, onMarkRead, onRefresh }: Props) {
  const { t, tag } = useI18n();
  const [periodKey, setPeriodKey] = useState('month');
  const period = periodKey === 'previous' ? monthPeriod(shiftDay(today.slice(0, 8) + '01', -1)) : periodKey === '30' ? { from: shiftDay(today, -29), to: today } : monthPeriod(today);
  const metrics = computeMetrics(records, period);
  const clients = records.filter((r) => r.kind === 'client' && !r.archived);
  const parent = (id?: string) => records.find((r) => r.id === id);
  const tasks = records.filter((r) => r.kind === 'task' && !r.archived && !parent(r.clientId)?.archived && !parent(r.projectId)?.archived);
  const byCourt = (court: Court) => tasks.filter((item) => courtOf(item) === court);
  const events = records.filter((r) => r.kind === 'event' && r.audience !== 'client').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unread = events.filter((e) => !e.read);
  const requests = tasks.filter((item) => item.request && item.status === 'À faire');
  const overBudget = tasks.filter((item) => (item.revisionRound ?? 0) > flow.maxRevisionRounds && item.status !== 'Validé');
  const cname = (id?: string) => clients.find((c) => c.id === id)?.name || t('Client');
  const when = (iso: string) => new Date(iso).toLocaleString(tag, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const label = (type?: RecordItem['type']) => t(type === 'auto-approved' ? 'Validation tacite' : type === 'reminder' ? 'Rappel client' : type === 'sweep' ? 'Balayage J−1' : type === 'lock' ? 'Verrou J−7' : type === 'request' ? 'Demande' : 'Décision');
  const Icon = (type?: RecordItem['type']) => type === 'auto-approved' ? CheckCircle2 : type === 'reminder' ? Bell : type === 'sweep' ? AlertTriangle : type === 'lock' ? Lock : type === 'request' ? Inbox : Send;
  const periodLabel = `${new Date(period.from + 'T12:00:00').toLocaleDateString(tag, { day: 'numeric', month: 'short' })} → ${new Date(period.to + 'T12:00:00').toLocaleDateString(tag, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const days: string[] = []; for (let d = period.from; d <= period.to; d = shiftDay(d, 1)) days.push(d);
  const trend = days.map((day) => ({ x: day, y: tasks.filter((item) => item.publishedAt && dayIn(new Date(item.publishedAt)) === day).length, label: new Date(day + 'T12:00:00').toLocaleDateString(tag, { day: 'numeric', month: 'short' }) }));
  const courtColors: Record<Court, string> = { studio: '#20232a', client: '#E5A93C', done: '#3d8763' };
  const courtSlices: Slice[] = (['studio', 'client', 'done'] as Court[]).map((court) => ({ key: court, label: t(court === 'studio' ? 'Studio' : court === 'client' ? 'Client' : 'Terminé'), value: byCourt(court).length, color: courtColors[court] }));
  const compareData = metrics.clients.filter((c) => c.quota).sort((a, b) => (b.quota ?? 0) - (a.quota ?? 0)).slice(0, 10).map((c) => ({ key: c.clientId, label: c.name, a: c.quota ?? 0, b: c.delivered }));

  return <div className="flow-page">
    <div className="page-heading"><span className="page-symbol" aria-hidden="true"><Gauge size={22} /></span><div className="heading-line"><h1>{t('Tableau de bord')}</h1><div className="inline"><Tabs value={periodKey} onValueChange={setPeriodKey}><TabsList><TabsTrigger value="month">{t('Ce mois')}</TabsTrigger><TabsTrigger value="previous">{t('Mois précédent')}</TabsTrigger><TabsTrigger value="30">{t('30 jours')}</TabsTrigger></TabsList></Tabs><button className="btn" disabled={busy} onClick={onRefresh}><RefreshCw size={15} />{t('Actualiser')}</button></div></div><p>{t('Les six nombres de The One Flow ·')}{' '}{periodLabel}</p></div>

    <div className="metric-grid flow-tiles">{tiles(metrics, t).map((tile) => <div className={`metric-card flow-tile ${tile.ok === null ? '' : tile.ok ? 'ok' : 'warn'}`} key={tile.label}><div className="metric-label"><span>{tile.label}</span><span className="metric-icon">{createElement(tile.icon, { size: 18 })}</span></div><strong>{tile.value}</strong><small>{tile.detail}</small><span className="flow-target">{t('Cible {target}', { target: tile.target })}</span></div>)}</div>

    <div className="chart-row">
      <section className="work-panel">
        <div className="section-head"><div><h2>{t('Volume publié')}</h2><p>{t('Contenus publiés par jour ·')}{' '}{periodLabel}</p></div></div>
        <div className="flow-panel-body"><TrendArea data={trend} color="#E5A93C" height={182} xTickFormatter={(x) => new Date(`${x}T12:00:00`).toLocaleDateString(tag, { day: 'numeric', month: 'short' })} /></div>
      </section>
      <section className="work-panel">
        <div className="section-head"><div><h2>{t('Dans quel camp ?')}<span className="neutral-badge">{tasks.filter((item) => courtOf(item) !== 'done').length}</span></h2><p>{t('Qui doit agir maintenant, tâche par tâche.')}</p></div></div>
        <div className="flow-panel-body"><DonutStat data={courtSlices} centerLabel={t('Tâches')} /></div>
      </section>
    </div>

    <div className="flow-grid">
      <section className="work-panel">
        <div className="section-head"><div><h2>{t('Chez le client')}<span className="neutral-badge">{byCourt('client').length}</span></h2><p>{t('Qui doit agir maintenant, tâche par tâche.')}</p></div></div>
        {!!overBudget.length && <div className="flow-panel-body"><div className="flow-warning"><AlertTriangle size={15} /><span>{overBudget.length === 1 ? t('1 contenu hors forfait (plus de {n} tours). Accord du propriétaire requis avant reprise.', { n: flow.maxRevisionRounds }) : t('{c} contenus hors forfait (plus de {n} tours). Accord du propriétaire requis avant reprise.', { c: overBudget.length, n: flow.maxRevisionRounds })}</span></div></div>}
        <div className="task-rows">{byCourt('client').slice(0, 8).map((item) => <button className="task-line" key={item.id} onClick={() => onOpenTask(item.id)}><span className="task-line-icon"><Clock size={16} /></span><span className="task-line-name"><strong>{item.name}</strong><small>{cname(item.clientId)}{' '}{t('· tacite le {when}', { when: item.approvalDueAt ? when(item.approvalDueAt) : '—' })}</small></span><span className="court client"><i />{t('Client')}</span><ChevronRight size={15} /></button>)}{!byCourt('client').length && <p className="small-note flow-empty">{t('Rien n’attend le client.')}</p>}</div>
      </section>

      <section className="review-panel">
        <div className="section-head"><div><h2>{t('Alertes & rappels')}</h2><p>{t('Validations tacites, balayage J−1, verrou J−7, demandes.')}</p></div>{!!unread.length && <button className="btn" disabled={busy} onClick={() => void onMarkRead(unread.map((e) => e.id))}><BellOff size={14} />{t('Tout marquer lu')}</button>}</div>
        <div className="flow-feed">{events.slice(0, 30).map((e) => { return <button key={e.id} className={`flow-event ${e.read ? 'read' : ''} ${e.type}`} onClick={() => { if (e.taskId) onOpenTask(e.taskId); if (!e.read) void onMarkRead([e.id]); }}><span className="flow-event-icon">{createElement(Icon(e.type), { size: 15 })}</span><span><small>{label(e.type)} · {when(e.createdAt)}</small><strong>{e.name}</strong></span></button>; })}{!events.length && <p className="small-note flow-empty">{t('Aucune alerte. Les horloges tournent.')}</p>}</div>
      </section>
    </div>

    <section className="work-panel flow-table">
      <div className="section-head"><div><h2>{t('Par client')}</h2><p>{t('Vendu, livré et réserve evergreen sur la période.')}</p></div>{!!requests.length && <span className="neutral-badge">{requests.length === 1 ? t('1 demande à planifier') : t('{n} demandes à planifier', { n: requests.length })}</span>}</div>
      {!!compareData.length && <div className="flow-panel-body"><BarCompare data={compareData} aLabel={t('Vendu / mois')} bLabel={t('Publiés')} height={214} /></div>}
      <div className="table-area"><Table className="flow-client-table"><TableHeader><TableRow><TableHead>{t('Client')}</TableHead><TableHead>{t('Vendu / mois')}</TableHead><TableHead>{t('Publiés')}</TableHead><TableHead>{t('Livré vs vendu')}</TableHead><TableHead>{t('Chez le client')}</TableHead><TableHead>{t('Réserve evergreen')}</TableHead></TableRow></TableHeader>
        <TableBody>{metrics.clients.map((c) => <TableRow key={c.clientId}><TableCell><button className="table-name" onClick={() => onOpenClient(c.clientId)}>{c.name}</button></TableCell><TableCell>{c.quota ?? <span className="small-note">{t('À renseigner')}</span>}</TableCell><TableCell>{c.delivered}</TableCell><TableCell><span className={`flow-value ${c.ratio !== null && (c.ratio < flow.targets.deliveredVsSold[0] || c.ratio > flow.targets.deliveredVsSold[1]) ? 'off' : c.ratio !== null ? 'ok' : ''}`}>{pct(c.ratio)}</span></TableCell><TableCell>{byCourt('client').filter((item) => item.clientId === c.clientId).length}</TableCell><TableCell><span className={`flow-value ${c.evergreen < flow.targets.evergreen ? 'off' : 'ok'}`}>{c.evergreen} / {flow.targets.evergreen}</span></TableCell></TableRow>)}</TableBody></Table></div>
      {!clients.length && <p className="small-note flow-empty">{t('Ajoutez un client pour suivre ces nombres.')}</p>}
    </section>

    <section className="work-panel flow-rules">
      <div className="section-head"><div><h2>{t('Les règles en vigueur')}</h2><p>{t('Définies dans le contrat, appliquées par l’application.')}</p></div></div>
      <div className="flow-rules-grid">
        <div><strong>{flow.validationHours} h</strong><p>{t('Validation client. Le silence vaut validation ; rappels à {hours} h restantes.', { hours: flow.reminderHoursLeft.join(t(' h et ')) })}</p></div>
        <div><strong>{t('{n} tours', { n: flow.maxRevisionRounds })}</strong><p>{t('Retours consolidés inclus. Le tour {n} est hors forfait et demande l’accord du propriétaire.', { n: flow.maxRevisionRounds + 1 })}</p></div>
        <div><strong>J−{flow.lockDays}</strong><p>{t('Calendrier gelé. Créer ou déplacer un contenu dans la semaine demande la levée du verrou par un administrateur.')}</p></div>
        <div><strong>{flow.gates.map((g) => `J−${g.offset}`).join(' · ')}</strong><p>{t('Les quatre jalons de chaque contenu : {gates}.', { gates: flow.gates.map((g) => t(g.label).toLocaleLowerCase(tag)).join(', ') })}</p></div>
        <div><strong>{t('{n} evergreen', { n: flow.evergreenTarget })}</strong><p>{t('Contenus validés, sans date, prêts à combler un trou dans le calendrier de chaque client.')}</p></div>
        <div><strong>{t('Un seul canal')}</strong><p>{t('Retours et validations passent par le portail. Aucun message externe n’est envoyé automatiquement.')}</p></div>
      </div>
    </section>
  </div>;
}
