'use client';
// The client portal: four read-only screens, a request form and the review page.
// Rendered for a signed-in client contact (mode "client") and for the studio's own preview (mode "preview").
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, FileText, Home, Inbox, Loader2, LogOut, Send, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Sidebar, SidebarProvider, SidebarHeader, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import Avatar from '@/app/profile-avatar';
import { type RecordItem, statuses, safeLink, channels, dayKey } from '@/lib/model';
import { flow, hoursLeft, revisionState } from '@/lib/flow';
import { portalCopy, portalLocaleFor, type PortalCopy } from '@/lib/portal-i18n';

export type PortalRoute = { page: string; id?: string; tab?: string };
type Props = {
  mode: 'client' | 'preview';
  records: RecordItem[];
  client: RecordItem;
  user: { id: string; name: string; email: string };
  route: PortalRoute;
  today: string;
  busy: boolean;
  error: string;
  notice: string;
  navigate: (route: PortalRoute) => void;
  mutate: (body: unknown) => Promise<unknown>;
  onNotice: (text: string) => void;
  onError: (text: string) => void;
  onLeave: () => void;
};

function Chip({ status = 'À faire', copy }: { status?: RecordItem['status']; copy: PortalCopy }) {
  const index = statuses.indexOf(status);
  return <span className={`status s${index}`}>{copy.status[status]}</span>;
}

function NavItem({ icon: Icon, label, active, badge, onClick }: { icon: LucideIcon; label: string; active?: boolean; badge?: number; onClick: () => void }) {
  const { setOpenMobile } = useSidebar();
  return <SidebarMenuItem><SidebarMenuButton isActive={active} className="nav-item" onClick={() => { onClick(); setOpenMobile(false); }}><Icon strokeWidth={1.5} /><span>{label}</span>{!!badge && <span className="counter">{badge}</span>}</SidebarMenuButton></SidebarMenuItem>;
}

export default function Portal({ mode, records, client, user, route, today, busy, error, notice, navigate, mutate, onNotice, onError, onLeave }: Props) {
  const copy = portalCopy[portalLocaleFor(client.language)];
  const rtl = copy.dir === 'rtl';
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const [dialog, setDialog] = useState<'approve' | 'changes' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [text, setText] = useState('');
  const [comment, setComment] = useState('');
  const [request, setRequest] = useState({ name: '', projectId: '', due: '', channel: '', description: '' });
  const [formError, setFormError] = useState('');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const projects = records.filter((r) => r.kind === 'project' && r.clientId === client.id && !r.archived);
  const tasks = records.filter((r) => r.kind === 'task' && r.clientId === client.id && !r.archived && (!r.projectId || projects.some((p) => p.id === r.projectId)));
  const waiting = tasks.filter((t) => t.status === 'À valider');
  const production = tasks.filter((t) => t.status === 'À faire' || t.status === 'En cours');
  const validatedThisMonth = tasks.filter((t) => t.status === 'Validé' && t.validatedAt && t.validatedAt.slice(0, 7) === today.slice(0, 7));
  const upcoming = tasks.filter((t) => t.due && t.due >= today && !t.publishedAt).sort((a, b) => a.due!.localeCompare(b.due!));
  const files = tasks.filter((t) => !!link(t) && (t.status === 'À valider' || t.status === 'Validé'));
  const myRequests = tasks.filter((t) => t.request).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const events = records.filter((r) => r.kind === 'event' && r.clientId === client.id && r.audience !== 'studio').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const task = route.page === 'review' ? tasks.find((t) => t.id === route.id) ?? null : null;
  const tab = route.page === 'review' ? 'review' : route.tab || 'home';
  const pname = (id?: string) => projects.find((p) => p.id === id)?.name || '';
  const fmt = (iso?: string, withTime = false) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString(copy.locale, withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' }) : copy.noDate;
  function link(t: RecordItem) { return t.demo && t.deliverable === '/demo-deliverable.html' ? '/demo-deliverable.html' : safeLink(t.deliverable || ''); }
  const go = (tab: string) => navigate({ page: 'portal', id: client.id, tab });

  async function decide(kind: 'approve' | 'changes') {
    if (!task) return;
    try {
      if (kind === 'approve') { await mutate({ action: 'approve', taskId: task.id }); onNotice(copy.approved); }
      else {
        if (!text.trim()) { setFormError(copy.changesPlaceholder); return; }
        await mutate({ action: 'request-changes', taskId: task.id, text });
        onNotice(copy.changesButton);
      }
      setDialog(null); setText(''); setConfirm(false); setFormError('');
    } catch (e) { setFormError((e as Error).message); }
  }
  async function sendComment(e: React.FormEvent) {
    e.preventDefault(); if (!task || !comment.trim()) return;
    try { await mutate({ action: 'comment', taskId: task.id, text: comment }); setComment(''); } catch (e) { onError((e as Error).message); }
  }
  async function sendRequest(e: React.FormEvent) {
    e.preventDefault(); setFormError('');
    try {
      await mutate({ action: 'request', clientId: client.id, data: { ...request } });
      setRequest({ name: '', projectId: '', due: '', channel: '', description: '' });
      onNotice(copy.requestSent);
    } catch (e) { setFormError((e as Error).message); }
  }

  function Countdown({ t }: { t: RecordItem }) {
    const left = hoursLeft(t, now);
    if (left === null) return null;
    return <div className="portal-clock"><Clock size={15} /><span>{copy.clock(Math.max(0, left))}</span></div>;
  }
  function Rounds({ t }: { t: RecordItem }) {
    const r = revisionState(t);
    return <p className="portal-rounds">{copy.rounds(r.used, r.included)}{r.overBudget ? ` · ${copy.roundsOver}` : r.lastIncluded ? ` · ${copy.roundsLast}` : ''}</p>;
  }
  function Card({ t }: { t: RecordItem }) {
    return <article className="review-card" key={t.id}>
      <div className="review-thumb"><FileText size={42} /><small>{t.demo ? copy.demoDoc.toUpperCase() : copy.version.toUpperCase()}</small></div>
      <div>
        <Chip status={t.status} copy={copy} />
        <h2>{t.name}</h2>
        <small>{pname(t.projectId)}{t.sentAt ? ` · ${copy.sentOn(fmt(t.sentAt, true))}` : ''}</small>
        <p>{t.description?.split('\n')[0]}</p>
        {t.status === 'À valider' && Countdown({ t })}
        <button className="btn" onClick={() => navigate({ page: 'review', id: t.id })}>{copy.openReview}<ArrowUpRight size={15} /></button>
      </div>
    </article>;
  }

  function Calendar() {
    const start = new Date(month); start.setDate(1); start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
    return <div className="calendar-wrap">
      <div className="calendar-toolbar">
        <button className="btn" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>{copy.today}</button>
        <button className="icon-button" aria-label={copy.previous} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>{rtl ? <ChevronRight /> : <ChevronLeft />}</button>
        <button className="icon-button" aria-label={copy.next} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>{rtl ? <ChevronLeft /> : <ChevronRight />}</button>
        <h2>{month.toLocaleDateString(copy.locale, { month: 'long', year: 'numeric' })}</h2>
      </div>
      <div className="calendar-grid">
        <div className="weekdays">{copy.weekdays.map((d) => <span key={d}>{d}</span>)}</div>
        <div className="calendar-days">{days.map((d) => {
          const key = dayKey(d);
          const items = tasks.filter((t) => t.due === key);
          return <div className={`calendar-day ${d.getMonth() !== month.getMonth() ? 'outside' : ''}`} key={key}>
            <header><span className={key === today ? 'today' : ''}>{d.getDate()}</span></header>
            {items.map((t) => <button key={t.id} className="calendar-event" onClick={() => navigate({ page: 'review', id: t.id })}><strong>{t.name}</strong>{t.time && t.channel && <small>{t.time} · {t.channel}</small>}<Chip status={t.status} copy={copy} /></button>)}
          </div>;
        })}</div>
      </div>
    </div>;
  }

  function HomeScreen() {
    const first = user.name.includes('@') ? '' : user.name.split(' ')[0];
    return <>
      <div className="page-heading"><div className="eyebrow">{copy.space.toUpperCase()}</div><h1>{copy.hello(first || client.contact || client.name)}</h1><p>{copy.tagline}</p></div>
      <div className={`portal-banner ${waiting.length ? 'active' : ''}`}><CheckCircle2 size={18} /><span>{waiting.length ? copy.waiting(waiting.length) : copy.nothingWaiting}</span>{!!waiting.length && <button className="btn primary" onClick={() => go('review')}>{copy.review}</button>}</div>
      <div className="portal-stats">{[[copy.inProduction, production.length], [copy.review, waiting.length], [copy.validatedThisMonth, validatedThisMonth.length]].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{String(value).padStart(2, '0')}</strong></div>)}</div>
      <section className="portal-section"><div className="section-head"><h2>{copy.upcoming}</h2><button className="text-link" onClick={() => go('calendar')}>{copy.calendar}<ArrowUpRight size={14} /></button></div>
        {upcoming.length ? <div className="task-rows">{upcoming.slice(0, 6).map((t) => <button className="task-line" key={t.id} onClick={() => navigate({ page: 'review', id: t.id })}><span className="task-line-icon"><CalendarDays size={16} /></span><span className="task-line-name"><strong>{t.name}</strong><small>{pname(t.projectId)}</small></span><Chip status={t.status} copy={copy} /><span className="due">{fmt(t.due)}</span>{rtl ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}</button>)}</div> : <p className="small-note">{copy.noUpcoming}</p>}
      </section>
      <section className="portal-section"><div className="section-head"><h2>{copy.activity}</h2></div>
        <div className="portal-activity">{events.slice(0, 6).map((e) => <div key={e.id}><span className={`portal-dot ${e.type}`} /><p>{e.name}<small>{fmt(e.createdAt, true)}</small></p></div>)}{!events.length && <p className="small-note">{copy.conversationStart}</p>}</div>
      </section>
    </>;
  }

  function ListScreen({ items, title, empty, emptyText }: { items: RecordItem[]; title: string; empty: string; emptyText: string }) {
    return <>
      <div className="page-heading"><h1>{title}</h1><p>{client.name}</p></div>
      <div className="review-list">{items.map((t) => Card({ t }))}</div>
      {!items.length && <div className="portal-empty"><CheckCircle2 size={28} /><h2>{empty}</h2><p>{emptyText}</p></div>}
    </>;
  }

  function RequestScreen() {
    return <>
      <div className="page-heading"><h1>{copy.requestTitle}</h1><p>{copy.requestText}</p></div>
      <div className="portal-request">
        <form onSubmit={sendRequest} className="form-fields">
          <label className="form-field"><span>{copy.requestName} *</span><input required maxLength={160} value={request.name} onChange={(e) => setRequest({ ...request, name: e.target.value })} /></label>
          <div className="form-pair">
            <label className="form-field"><span>{copy.requestProject}</span><select value={request.projectId} onChange={(e) => setRequest({ ...request, projectId: e.target.value })}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="form-field"><span>{copy.requestDate}</span><input type="date" min={today} value={request.due} onChange={(e) => setRequest({ ...request, due: e.target.value })} /></label>
          </div>
          <label className="form-field"><span>{copy.requestChannel}</span><select value={request.channel} onChange={(e) => setRequest({ ...request, channel: e.target.value })}><option value="">—</option>{channels.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="form-field"><span>{copy.requestDescription}</span><textarea rows={5} maxLength={15000} value={request.description} onChange={(e) => setRequest({ ...request, description: e.target.value })} /></label>
          <small className="small-note">{copy.requestLockNote(flow.lockDays)}</small>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="inline"><button className="btn primary" disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />}{copy.requestButton}</button></div>
        </form>
        <aside>
          <h3>{copy.myRequests.toUpperCase()}</h3>
          {myRequests.length ? <div className="task-rows">{myRequests.map((t) => <button className="task-line" key={t.id} onClick={() => navigate({ page: 'review', id: t.id })}><span className="task-line-icon"><Inbox size={16} /></span><span className="task-line-name"><strong>{t.name}</strong><small>{copy.requestedOn(fmt(t.request?.at))}{t.due ? ` · ${copy.dueOn(fmt(t.due))}` : ''}</small></span><Chip status={t.status} copy={copy} /></button>)}</div> : <p className="small-note">{copy.noRequests}</p>}
        </aside>
      </div>
    </>;
  }

  function ReviewScreen() {
    if (!task) return <div className="portal-empty"><h2>{copy.notFound}</h2></div>;
    const comments = records.filter((r) => r.kind === 'comment' && r.taskId === task.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const url = link(task);
    const signOff = task.signOff;
    return <>
      <button className="text-link back" onClick={() => go('review')}>{rtl ? <ArrowUpRight size={15} style={{ transform: 'rotate(180deg)' }} /> : <ArrowLeft size={15} />}{copy.back}</button>
      <div className="page-heading"><div className="heading-line"><h1>{task.name}</h1>{task.status === 'À valider' ? <div className="inline"><button className="btn" disabled={busy} onClick={() => { setFormError(''); setDialog('changes'); }}>{copy.requestChanges}</button><button className="btn primary" disabled={busy} onClick={() => { setFormError(''); setConfirm(false); setDialog('approve'); }}><Check size={16} />{copy.approve}</button></div> : <Chip status={task.status} copy={copy} />}</div><p>{pname(task.projectId)}{task.due ? ` · ${copy.dueOn(fmt(task.due))}` : ''}</p></div>
      {task.status === 'À valider' && <div className="portal-clock-block">{Countdown({ t: task })}<small>{copy.clockRule(flow.validationHours)}</small>{Rounds({ t: task })}</div>}
      {signOff && <div className="portal-receipt"><ShieldCheck size={18} /><div><strong>{copy.receipt}</strong><dl><div><dt>{copy.receiptMode}</dt><dd>{signOff.mode === 'silence' ? copy.silence : signOff.mode === 'studio' ? copy.studio : copy.explicit}</dd></div><div><dt>{copy.receiptContact}</dt><dd>{signOff.by}{signOff.email ? ` · ${signOff.email}` : ''}</dd></div><div><dt>{copy.receiptWhen}</dt><dd>{fmt(signOff.at, true)}</dd></div><div><dt>{copy.receiptRound}</dt><dd>{signOff.round} / {flow.maxRevisionRounds}</dd></div></dl></div></div>}
      <div className="review-layout">
        <div className="review-canvas">{task.demo ? <div className="sample-document"><span>THE ONE CORE</span><h2>Une idée claire.<br />Une marque singulière.</h2><hr /><p>{client.name}</p><small>{copy.demoDoc}<br />{copy.demoNote}</small></div> : <div className="external-file"><FileText size={50} /><h2>{copy.externalTitle}</h2><p>{copy.externalText}</p>{url ? <a className="btn" href={url} target="_blank" rel="noopener noreferrer">{copy.openFile}<ArrowUpRight size={16} /></a> : <p>{copy.noLink}</p>}</div>}</div>
        <aside>
          <section className="comments"><h2>{copy.comments}</h2>
            {comments.map((c) => <div className="comment" key={c.id}><Avatar name={c.author} /><div><strong>{c.author}</strong><small>{fmt(c.createdAt, true)}</small><p>{c.name}</p></div></div>)}
            {!comments.length && <p className="small-note">{copy.conversationStart}</p>}
            <form className="comment-composer" onSubmit={sendComment}><Avatar name={user.name} /><textarea maxLength={5000} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={copy.writeComment} aria-label={copy.writeComment} /><button className="btn" disabled={busy || !comment.trim()} aria-label={copy.send}><Send size={16} /></button></form>
          </section>
        </aside>
      </div>
    </>;
  }

  const title = tab === 'home' ? copy.home : tab === 'calendar' ? copy.calendar : tab === 'files' ? copy.files : tab === 'request' ? copy.request : copy.review;

  return <div dir={copy.dir} lang={rtl ? 'ar' : 'fr'} className={`portal-root ${rtl ? 'portal-rtl' : ''}`}>
    <SidebarProvider style={{ '--sidebar-width': '260px' } as React.CSSProperties}>
      <Sidebar className="tracker-sidebar" side={rtl ? 'right' : 'left'}>
        <SidebarHeader><div className="brand"><img className="sidebar-logo logo-white" src="/the-one-core-logo-white.svg" alt="The One Core" /><div><strong>{client.name}</strong><small>{copy.portal}</small></div></div></SidebarHeader>
        <SidebarContent><SidebarGroup><SidebarGroupLabel>{copy.space.toUpperCase()}</SidebarGroupLabel><SidebarMenu>
          <NavItem icon={Home} label={copy.home} active={tab === 'home'} onClick={() => go('home')} />
          <NavItem icon={CheckCircle2} label={copy.review} active={tab === 'review'} badge={waiting.length} onClick={() => go('review')} />
          <NavItem icon={CalendarDays} label={copy.calendar} active={tab === 'calendar'} onClick={() => go('calendar')} />
          <NavItem icon={FileText} label={copy.files} active={tab === 'files'} onClick={() => go('files')} />
          <NavItem icon={Inbox} label={copy.request} active={tab === 'request'} onClick={() => go('request')} />
        </SidebarMenu></SidebarGroup></SidebarContent>
        <SidebarFooter>
          {mode === 'preview' && <button className="btn" onClick={onLeave}><ArrowLeft size={15} />{copy.backToStudio}</button>}
          <div className="user-row"><Avatar name={user.name} /><div><strong>{user.name.includes('@') ? user.name.split('@')[0] : user.name}</strong><small>{mode === 'preview' ? 'Aperçu studio' : client.name}</small></div>{mode === 'client' && <button disabled={busy} onClick={onLeave} aria-label={copy.signOut}><LogOut size={15} /></button>}</div>
        </SidebarFooter>
      </Sidebar>
      <main className="workspace">
        <header className="topbar"><SidebarTrigger aria-label="Menu" /><span className="workspace-label"><Eye size={14} />{copy.portal}</span>{rtl ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}<span>{title}</span><div className="grow" />{busy && <span className="save-state"><Loader2 className="spin" size={13} />…</span>}</header>
        {mode === 'preview' && <div className="preview-banner"><Eye size={16} /><span>{copy.previewBanner}</span><button className="text-link" onClick={onLeave}>{copy.leave}<ArrowUpRight size={14} /></button></div>}
        <div className="page-content">
          {error && <div className="error-banner" role="alert"><span>{error}</span><button className="btn" onClick={() => onError('')}>OK</button></div>}
          {route.page === 'review' ? ReviewScreen() : tab === 'home' ? HomeScreen() : tab === 'calendar' ? <><div className="page-heading"><h1>{copy.calendar}</h1><p>{client.name}</p></div>{Calendar()}</> : tab === 'files' ? ListScreen({ items: files, title: copy.files, empty: copy.noFiles, emptyText: copy.noFilesText }) : tab === 'request' ? RequestScreen() : ListScreen({ items: waiting, title: copy.review, empty: copy.nothingWaiting, emptyText: copy.nothingWaitingText })}
        </div>
      </main>
      {notice && <div className="toast" role="status"><CheckCircle2 size={17} />{notice}</div>}
      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o && !busy) setDialog(null); }}>
        <DialogContent className="tracker-modal" dir={copy.dir}>
          <DialogHeader><DialogTitle>{dialog === 'approve' ? copy.approveTitle : copy.changesTitle}</DialogTitle><DialogDescription>{dialog === 'approve' ? copy.approveText(task?.name ?? '') : copy.changesText}</DialogDescription></DialogHeader>
          {dialog === 'approve' ? <label className="portal-confirm"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /><span>{copy.approveConfirm}</span></label>
            : <label className="form-field"><span>{copy.changesTitle}</span><textarea autoFocus rows={6} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} placeholder={copy.changesPlaceholder} /></label>}
          {task && dialog === 'changes' && Rounds({ t: task })}
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <DialogFooter className="modal-footer"><button type="button" className="btn" disabled={busy} onClick={() => setDialog(null)}>{copy.cancel}</button><button className="btn primary" disabled={busy || (dialog === 'approve' && !confirm)} onClick={() => void decide(dialog!)}>{busy ? <Loader2 size={15} className="spin" /> : dialog === 'approve' ? <Check size={15} /> : <Send size={15} />}{dialog === 'approve' ? copy.approveButton : copy.changesButton}</button></DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  </div>;
}
