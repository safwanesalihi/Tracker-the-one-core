'use client';

import { useRef, useState } from 'react';
import { Copy, Download, KeyRound, Lock, Mail, MailCheck, RefreshCw, Search, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import Avatar from '@/app/profile-avatar';
import { canManageMembers, invitableRoles, memberName, roleDescriptions, roleLabels, workspaceRoles, type EditableRole, type Invitation, type MemberChange, type WorkspaceContext, type WorkspaceMember } from '@/lib/workspace';
import type { RecordItem } from '@/lib/model';
import { useI18n } from '@/app/locale-provider';
import { buildInvitePdf, downloadPdf } from '@/lib/invite-pdf';

type Props = {
  workspace: WorkspaceContext | null;
  members: WorkspaceMember[];
  clients?: RecordItem[];
  currentUserId: string;
  busy: boolean;
  mailConfigured?: boolean;
  onChange: (change: MemberChange) => Promise<Invitation | void>;
  onRefresh: () => void;
};

export default function TeamPage({ workspace, members, clients = [], currentUserId, busy, mailConfigured = false, onChange, onRefresh }: Props) {
  const { t, tag } = useI18n();
  const [copyFeedback, setCopyFeedback] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<WorkspaceMember | null>(null);
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);
  const [role, setRole] = useState<EditableRole>('viewer');
  const [roleClient, setRoleClient] = useState('');
  const [invite, setInvite] = useState({ email: '', name: '', role: 'creative' as EditableRole, clientId: '' });
  const [inviteError, setInviteError] = useState('');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [inviteContext, setInviteContext] = useState<{ name: string; role: EditableRole } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [renewing, setRenewing] = useState<WorkspaceMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const opener = useRef<HTMLButtonElement | null>(null);
  const inFlight = useRef(false);
  const allowed = !!workspace && canManageMembers(workspace.role);
  const disabled = busy || saving;

  async function save(change: MemberChange) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError('');
    try {
      await onChange(change);
      setEditing(null);
      setRemoving(null);
    } catch (error) {
      setSaveError(error instanceof Error ? t(error.message) : t('Enregistrement impossible. Réessayez.'));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function sendInvite(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setSaving(true); setInviteError(''); setInvitation(null); setPdfError('');
    try {
      const result = await onChange({ action: 'invite-member', email: invite.email, name: invite.name, role: invite.role, ...(invite.role === 'client' ? { clientId: invite.clientId } : {}) });
      if (result) { setInvitation(result); setInviteContext({ name: invite.name, role: invite.role }); }
      setInvite({ email: '', name: '', role: 'creative', clientId: '' });
    } catch (error) {
      setInviteError(error instanceof Error ? t(error.message) : t('Invitation impossible. Réessayez.'));
    } finally { inFlight.current = false; setSaving(false); }
  }
  async function renew() {
    if (!renewing || inFlight.current) return;
    inFlight.current = true; setSaving(true); setSaveError(''); setInvitation(null); setPdfError('');
    try {
      const result = await onChange({ action: 'renew-invitation', userId: renewing.userId });
      if (result) { setInvitation(result); setInviteContext({ name: memberName(renewing), role: renewing.role as EditableRole }); }
      setRenewing(null);
      document.getElementById('team-invite-title')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (error) {
      setSaveError(error instanceof Error ? t(error.message) : t('Envoi impossible. Réessayez.'));
    } finally { inFlight.current = false; setSaving(false); }
  }
  async function downloadInvitePdf() {
    if (!invitation?.temporaryPassword || !inviteContext) return;
    setPdfBusy(true); setPdfError('');
    try {
      const bytes = await buildInvitePdf({
        name: inviteContext.name || invitation.email,
        // The PDF template itself is hardcoded French, so the role label stays in French
        // too (not run through t()) regardless of the studio's own current UI language.
        roleLabel: roleLabels[inviteContext.role],
        email: invitation.email,
        temporaryPassword: invitation.temporaryPassword,
        url: window.location.origin,
        studioName: workspace?.name || 'The One Core',
      });
      downloadPdf(bytes, `acces-${invitation.email}.pdf`);
    } catch {
      setPdfError(t('Génération du PDF impossible. Réessayez.'));
    } finally { setPdfBusy(false); }
  }
  const when = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString(tag, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  const clientName = (id?: string | null) => clients.find((c) => c.id === id)?.name || t('Client à préciser');
  const activeClients = clients.filter((c) => !c.archived);

  const visible = members.filter((member) =>
    (filter === 'all' || member.role === filter) &&
    `${member.name ?? ''} ${member.email ?? ''} ${member.userId}`.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr')),
  );
  // Client portal access lives in its own list, apart from the studio's internal team.
  const visibleTeam = visible.filter((member) => member.role !== 'client');
  const visibleClients = visible.filter((member) => member.role === 'client');
  const managers = members.filter((member) => canManageMembers(member.role)).length;
  const viewers = members.filter((member) => member.role === 'viewer').length;

  const memberRow = (member: WorkspaceMember) => {
    const name = memberName(member);
    const own = member.userId === currentUserId;
    const editable = allowed && member.role !== 'owner' && !own;
    return <TableRow key={member.userId}>
      <TableCell><div className="team-person"><Avatar name={name} avatar={member.avatar} /><div className="member-identity">
        <strong>{name} {own && <span className="neutral-badge">{t('Vous')}</span>}{member.pending && <span className="neutral-badge"><Mail size={10} />{' '}{t('En attente de première connexion')}</span>}</strong>
        <small>{member.role === 'client' ? t('Portail · {client}', { client: clientName(member.clientId) ?? '' }) : member.email || t(roleLabels[member.role])}{allowed && member.lastLoginAt ? t(' · dernière connexion {when}', { when: when(member.lastLoginAt) ?? '' }) : ''}</small>
      </div></div></TableCell>
      <TableCell><span className="team-role-label">{t(roleLabels[member.role])}</span></TableCell>
      <TableCell className="team-date"><time dateTime={member.createdAt}>{new Date(member.createdAt).toLocaleDateString(tag, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</time></TableCell>
      <TableCell><div className="team-member-actions">{editable ? <>
        <button className="btn" disabled={disabled} aria-label={`Modifier le rôle de ${name}`} onClick={(event) => { opener.current = event.currentTarget; setRole(member.role as EditableRole); setRoleClient(member.clientId || ''); setSaveError(''); setEditing(member); }}>{t('Modifier')}</button>
        <button className="btn" disabled={disabled} aria-label={`Renvoyer l’invitation à ${name}`} title={t('Nouveau mot de passe temporaire')} onClick={(event) => { opener.current = event.currentTarget; setSaveError(''); setRenewing(member); }}><Mail size={14} />{member.pending ? 'Renvoyer' : 'Réinitialiser'}</button>
        <button className="icon-button team-remove" disabled={disabled} aria-label={`Retirer ${name} de l’espace`} onClick={(event) => { opener.current = event.currentTarget; setSaveError(''); setRemoving(member); }}><Trash2 size={16} /></button>
      </> : <span className="team-access-note"><Lock size={13} />{member.role === 'owner' ? t('Protégé') : own ? t('Votre accès') : t('Consultation')}</span>}</div></TableCell>
    </TableRow>;
  };

  return <div className="team-page">
    <div className="page-heading">
      <span className="page-symbol" aria-hidden="true"><Users size={22} /></span>
      <div className="heading-line"><h1>{t('Équipe')}</h1><button className="btn" onClick={onRefresh} disabled={disabled}><RefreshCw size={15} />{t('Actualiser')}</button></div>
      <p>{allowed ? t('Les personnes qui font avancer vos projets.') : t('Les personnes qui font avancer les projets du studio. La gestion des accès est réservée au propriétaire et aux administrateurs.')}</p>
    </div>
    {!workspace ? <Empty className="team-card">
      <EmptyHeader><Lock size={24} /><EmptyTitle>{t('Connectez votre espace')}</EmptyTitle>
        <EmptyDescription>{t('Connectez-vous pour consulter et gérer votre équipe.')}</EmptyDescription>
      </EmptyHeader>
      <a className="btn primary" href="/login" target="_top">{t('Se connecter')}</a>
    </Empty> : <>
      <div className="team-summary">
        {([['MEMBRES', members.length], ['GESTION DES ACCÈS', managers], ...(viewers ? [['LECTURE SEULE', viewers] as const] : []), ['ACCÈS CLIENT', members.filter((m) => m.role === 'client').length], ['EN ATTENTE', members.filter((m) => m.pending).length]] as const).map(([label, value]) =>
          <div key={label}><span>{t(label)}</span><strong>{value}</strong></div>)}
      </div>
      {allowed && <section className="team-card team-invite" aria-labelledby="team-invite-title">
        <div className="section-head"><div><h2 id="team-invite-title">{t('Inviter une personne')}</h2><p>{mailConfigured
          ? t('Un e-mail avec un mot de passe temporaire part depuis la boîte Gmail du studio. La personne se connecte et choisit son mot de passe.')
          : t('L’envoi d’e-mail n’est pas configuré : le mot de passe temporaire s’affiche ici, transmettez-le vous-même. La personne se connecte et choisit son mot de passe.')}</p></div></div>
        <form className="team-invite-form" onSubmit={sendInvite}>
          <label className="form-field"><span>{t('Nom')}</span><input required maxLength={120} value={invite.name} disabled={disabled} onChange={(event) => setInvite({ ...invite, name: event.target.value })} placeholder={t('Prénom Nom')} /></label>
          <label className="form-field"><span>{t('Adresse e-mail')}</span><input type="email" required maxLength={200} value={invite.email} disabled={disabled} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder={t('prenom@entreprise.com')} /></label>
          <label className="form-field"><span>{t('Rôle')}</span><Select value={invite.role} disabled={disabled} onValueChange={(value) => setInvite({ ...invite, role: value as EditableRole })}><SelectTrigger className="pick" aria-label={t('Rôle de l’invité')}><SelectValue /></SelectTrigger><SelectContent>{invitableRoles.map((value) => <SelectItem key={value} value={value}>{t(roleLabels[value])}</SelectItem>)}</SelectContent></Select></label>
          {invite.role === 'client' && <label className="form-field"><span>{t('Client')}</span><Select value={invite.clientId || '__none'} disabled={disabled} onValueChange={(value) => setInvite({ ...invite, clientId: value === '__none' ? '' : value })}><SelectTrigger className="pick" aria-label={t('Client de l’invité')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">{t('Choisir un client')}</SelectItem>{activeClients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></label>}
          <button className="btn primary" disabled={disabled || (invite.role === 'client' && !invite.clientId)}><UserPlus size={15} />{saving ? t('Envoi…') : mailConfigured ? t('Envoyer l’invitation') : t('Créer l’accès')}</button>
        </form>
        <p className="team-role-description">{t(roleDescriptions[invite.role])}</p>
        {inviteError && <p className="form-error" role="alert">{inviteError}</p>}
        {invitation && <div className={`team-invitation ${invitation.sent ? 'sent' : ''}`} role="status">
          {invitation.sent
            ? <><MailCheck size={18} /><div><strong>{t('Invitation envoyée à {email}', { email: invitation.email })}</strong><p>{t('Le mot de passe temporaire est dans l’e-mail. À sa première connexion, la personne choisira son mot de passe.')}</p></div></>
            : <><KeyRound size={18} /><div><strong>{t('Accès créé pour {email}', { email: invitation.email })}</strong>{invitation.error && <p className="form-error">{invitation.error}</p>}<p>{t('Transmettez ces informations à la personne (elle changera le mot de passe à sa première connexion) :')}</p>
              <dl><div><dt>{t('Adresse')}</dt><dd>{typeof window === 'undefined' ? '' : window.location.origin}</dd></div><div><dt>{t('Identifiant')}</dt><dd>{invitation.email}</dd></div><div><dt>{t('Mot de passe temporaire')}</dt><dd><code>{invitation.temporaryPassword}</code><button type="button" className="icon-button" aria-label={t('Copier le mot de passe temporaire')} onClick={async () => { try { await navigator.clipboard.writeText(invitation.temporaryPassword ?? ''); setCopyFeedback(t('Copié')); } catch { setCopyFeedback(t('Copie impossible. Sélectionnez le mot de passe pour le copier.')); } }}><Copy size={13} /></button>{copyFeedback && <small role="status">{copyFeedback}</small>}</dd></div></dl>
              <button type="button" className="btn" disabled={pdfBusy} onClick={downloadInvitePdf}><Download size={14} />{pdfBusy ? t('Génération…') : t('Télécharger en PDF')}</button>
              {pdfError && <p className="form-error" role="alert">{pdfError}</p>}
              <p>{t('Il n’est affiché qu’une fois. Pour en générer un autre : « Renvoyer » sur la ligne du membre.')}</p></div></>}
          <button type="button" className="icon-button" aria-label={t('Fermer')} onClick={() => setInvitation(null)}>{t('×')}</button>
        </div>}
      </section>}
      <section className="team-card" aria-labelledby="team-members-title">
        <div className="section-head team-toolbar">
          <div><h2 id="team-members-title" tabIndex={-1}>{t('Membres de l’équipe')}{' '}<span className="neutral-badge">{visibleTeam.length}</span></h2><p>{t('Votre rôle :')}{' '}{t(roleLabels[workspace.role])}</p></div>
          <div className="team-filters">
            <label className="search-input"><Search size={15} /><input aria-label={t('Rechercher un membre')} placeholder={t('Nom ou e-mail…')} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger aria-label={t('Filtrer les membres par rôle')} className="pick"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{t('Tous les rôles')}</SelectItem>{workspaceRoles.filter((value) => value !== 'client').map((value) => <SelectItem key={value} value={value}>{t(roleLabels[value])}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {visibleTeam.length ? <Table className="team-members-table">
          <TableHeader><TableRow><TableHead>{t('Membre')}</TableHead><TableHead>{t('Rôle')}</TableHead><TableHead className="team-date">{t('Depuis le')}</TableHead><TableHead className="team-actions-heading">{t('Accès')}</TableHead></TableRow></TableHeader>
          <TableBody>{visibleTeam.map(memberRow)}</TableBody>
        </Table> : <Empty><EmptyHeader><Users size={24} /><EmptyTitle>{members.some((m) => m.role !== 'client') ? 'Aucun résultat' : 'Aucun membre disponible'}</EmptyTitle><EmptyDescription>{members.some((m) => m.role !== 'client') ? 'Essayez un autre nom ou un autre rôle.' : 'Actualisez pour recharger les membres de cet espace.'}</EmptyDescription></EmptyHeader>{members.some((m) => m.role !== 'client') && <button className="btn" onClick={() => { setSearch(''); setFilter('all'); }}>{t('Effacer les filtres')}</button>}</Empty>}
      </section>
      <section className="team-card" aria-labelledby="team-clients-title">
        <div className="section-head team-toolbar">
          <div><h2 id="team-clients-title" tabIndex={-1}>{t('Clients')}{' '}<span className="neutral-badge">{visibleClients.length}</span></h2><p>{t('Accès portail, un contact par client.')}</p></div>
        </div>
        {visibleClients.length ? <Table className="team-members-table">
          <TableHeader><TableRow><TableHead>{t('Membre')}</TableHead><TableHead>{t('Rôle')}</TableHead><TableHead className="team-date">{t('Depuis le')}</TableHead><TableHead className="team-actions-heading">{t('Accès')}</TableHead></TableRow></TableHeader>
          <TableBody>{visibleClients.map(memberRow)}</TableBody>
        </Table> : <Empty><EmptyHeader><Users size={24} /><EmptyTitle>{members.some((m) => m.role === 'client') ? 'Aucun résultat' : 'Aucun accès client'}</EmptyTitle><EmptyDescription>{members.some((m) => m.role === 'client') ? 'Essayez un autre nom.' : 'Invitez un contact client ci-dessus pour lui ouvrir le portail.'}</EmptyDescription></EmptyHeader>{members.some((m) => m.role === 'client') && <button className="btn" onClick={() => setSearch('')}>{t('Effacer la recherche')}</button>}</Empty>}
      </section>
      <div className="team-lower">
        <section><h2>{t('Qui peut faire quoi ?')}</h2><p>{t('Les accès sont vérifiés à chaque action.')}</p>
          <div className="team-permissions">{workspaceRoles.filter((value) => value !== 'viewer' || members.some((m) => m.role === 'viewer')).map((value) => <div key={value}><ShieldCheck size={16} /><div><strong>{t(roleLabels[value])}</strong><p>{t(roleDescriptions[value])}</p></div></div>)}</div>
        </section>
        <section className="team-tip"><span className="onboarding-icon"><Lock size={20} /></span><h3>{t('Un accès à tout l’espace')}</h3><p>{t('Un « Membre » travaille sur les tâches qui lui sont assignées. Un accès « Client » ne voit que le portail de son client : livrables, validation, retours, demandes et calendrier.')}</p><p>{t('Chaque accès est créé ici avec un mot de passe temporaire ; la personne le remplace à sa première connexion. Mot de passe oublié ? « Réinitialiser » lui en envoie un nouveau.')}</p></section>
      </div>
    </>}
    <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
      <DialogContent className="tracker-modal team-modal" onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
        <DialogHeader><DialogTitle>{t('Modifier le rôle')}</DialogTitle><DialogDescription>{t('{name} · Le nouvel accès prend effet dès l’enregistrement.', { name: editing ? memberName(editing) : '' })}</DialogDescription></DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); if (editing) void save({ action: 'set-member-role', userId: editing.userId, expectedRole: editing.role, role, ...(role === 'client' ? { clientId: roleClient } : {}) }); }}>
          <label className="form-field"><span>{t('Rôle dans l’espace')}</span><Select value={role} disabled={disabled} onValueChange={(value) => setRole(value as EditableRole)}><SelectTrigger className="pick" aria-label={t('Nouveau rôle')}><SelectValue /></SelectTrigger><SelectContent>{[...invitableRoles, ...(editing?.role === 'viewer' ? ['viewer' as const] : [])].map((value) => <SelectItem key={value} value={value}>{t(roleLabels[value])}</SelectItem>)}</SelectContent></Select></label>
          {role === 'client' && <label className="form-field"><span>{t('Client')}</span><Select value={roleClient || '__none'} disabled={disabled} onValueChange={(value) => setRoleClient(value === '__none' ? '' : value)}><SelectTrigger className="pick" aria-label={t('Client')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">{t('Choisir un client')}</SelectItem>{activeClients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></label>}
          <p className="team-role-description">{t(roleDescriptions[role])}</p>
          {saveError && <p className="form-error" role="alert">{saveError}</p>}
          <DialogFooter className="modal-footer"><button className="btn" type="button" disabled={saving} onClick={() => setEditing(null)}>{t('Annuler')}</button><button className="btn primary" disabled={disabled || !allowed || (role === editing?.role && roleClient === (editing?.clientId || '')) || (role === 'client' && !roleClient)}>{t(saving ? 'Enregistrement…' : 'Enregistrer le rôle')}</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!renewing} onOpenChange={(open) => { if (!open && !saving) setRenewing(null); }}>
      <AlertDialogContent className="team-modal" onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>{t(renewing?.pending ? 'Renvoyer l’invitation ?' : 'Réinitialiser le mot de passe ?')}</AlertDialogTitle><AlertDialogDescription>{t(mailConfigured ? '{name} recevra un nouveau mot de passe temporaire par e-mail. L’ancien mot de passe et ses sessions en cours cessent de fonctionner immédiatement.' : '{name} recevra un nouveau mot de passe temporaire (affiché ici, à transmettre). L’ancien mot de passe et ses sessions en cours cessent de fonctionner immédiatement.', { name: renewing ? memberName(renewing) : '' })}</AlertDialogDescription></AlertDialogHeader>
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>{t('Annuler')}</AlertDialogCancel><AlertDialogAction disabled={disabled || !allowed} onClick={(event) => { event.preventDefault(); void renew(); }}>{t(saving ? 'Envoi…' : 'Confirmer')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={!!removing} onOpenChange={(open) => { if (!open && !saving) setRemoving(null); }}>
      <AlertDialogContent className="team-modal" onCloseAutoFocus={(event) => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); else document.getElementById('team-members-title')?.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>{t('Retirer l’accès à cet espace ?')}</AlertDialogTitle><AlertDialogDescription>{t('{name} ne pourra plus accéder aux clients, projets et tâches de cet espace. Ses contributions seront conservées. Rétablir cet accès nécessitera une nouvelle invitation.', { name: removing ? memberName(removing) : '' })}</AlertDialogDescription></AlertDialogHeader>
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>{t('Annuler')}</AlertDialogCancel><AlertDialogAction className="team-confirm-remove" disabled={disabled || !allowed} onClick={(event) => { event.preventDefault(); if (removing) void save({ action: 'remove-member', userId: removing.userId, expectedRole: removing.role }); }}>{t(saving ? 'Retrait…' : 'Retirer l’accès')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
