'use client';

import { useRef, useState } from 'react';
import { Copy, KeyRound, Lock, Mail, MailCheck, RefreshCw, Search, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import Avatar from '@/app/profile-avatar';
import { canManageMembers, invitableRoles, memberName, roleDescriptions, roleLabels, workspaceRoles, type EditableRole, type Invitation, type MemberChange, type WorkspaceContext, type WorkspaceMember } from '@/lib/workspace';
import type { RecordItem } from '@/lib/model';

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
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<WorkspaceMember | null>(null);
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);
  const [role, setRole] = useState<EditableRole>('viewer');
  const [roleClient, setRoleClient] = useState('');
  const [invite, setInvite] = useState({ email: '', name: '', role: 'creative' as EditableRole, clientId: '' });
  const [inviteError, setInviteError] = useState('');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
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
      setSaveError(error instanceof Error ? error.message : 'Enregistrement impossible. Réessayez.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function sendInvite(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setSaving(true); setInviteError(''); setInvitation(null);
    try {
      const result = await onChange({ action: 'invite-member', email: invite.email, name: invite.name, role: invite.role, ...(invite.role === 'client' ? { clientId: invite.clientId } : {}) });
      if (result) setInvitation(result);
      setInvite({ email: '', name: '', role: 'creative', clientId: '' });
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Invitation impossible. Réessayez.');
    } finally { inFlight.current = false; setSaving(false); }
  }
  async function renew() {
    if (!renewing || inFlight.current) return;
    inFlight.current = true; setSaving(true); setSaveError(''); setInvitation(null);
    try {
      const result = await onChange({ action: 'renew-invitation', userId: renewing.userId });
      if (result) setInvitation(result);
      setRenewing(null);
      document.getElementById('team-invite-title')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Envoi impossible. Réessayez.');
    } finally { inFlight.current = false; setSaving(false); }
  }
  const when = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  const clientName = (id?: string | null) => clients.find((c) => c.id === id)?.name || 'Client à préciser';
  const activeClients = clients.filter((c) => !c.archived);

  const visible = members.filter((member) =>
    (filter === 'all' || member.role === filter) &&
    `${member.name ?? ''} ${member.email ?? ''} ${member.userId}`.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr')),
  );
  const managers = members.filter((member) => canManageMembers(member.role)).length;
  const viewers = members.filter((member) => member.role === 'viewer').length;

  return <div className="team-page">
    <div className="page-heading">
      <span className="page-symbol" aria-hidden="true"><Users size={22} /></span>
      <div className="heading-line"><h1>Équipe</h1><button className="btn" onClick={onRefresh} disabled={disabled}><RefreshCw size={15} />Actualiser</button></div>
      <p>{allowed ? 'Les personnes qui font avancer vos projets.' : 'Les personnes qui font avancer les projets du studio. La gestion des accès est réservée au propriétaire et aux administrateurs.'}</p>
    </div>
    {!workspace ? <Empty className="team-card">
      <EmptyHeader><Lock size={24} /><EmptyTitle>Connectez votre espace</EmptyTitle>
        <EmptyDescription>Connectez-vous pour consulter et gérer votre équipe.</EmptyDescription>
      </EmptyHeader>
      <a className="btn primary" href="/login" target="_top">Se connecter</a>
    </Empty> : <>
      <div className="team-summary">
        {([['MEMBRES', members.length], ['GESTION DES ACCÈS', managers], ...(viewers ? [['LECTURE SEULE', viewers] as const] : []), ['ACCÈS CLIENT', members.filter((m) => m.role === 'client').length], ['EN ATTENTE', members.filter((m) => m.pending).length]] as const).map(([label, value]) =>
          <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      {allowed && <section className="team-card team-invite" aria-labelledby="team-invite-title">
        <div className="section-head"><div><h2 id="team-invite-title">Inviter une personne</h2><p>{mailConfigured
          ? 'Un e-mail avec un mot de passe temporaire part depuis la boîte Gmail du studio. La personne se connecte et choisit son mot de passe.'
          : 'L’envoi d’e-mail n’est pas configuré : le mot de passe temporaire s’affiche ici, transmettez-le vous-même. La personne se connecte et choisit son mot de passe.'}</p></div></div>
        <form className="team-invite-form" onSubmit={sendInvite}>
          <label className="form-field"><span>Nom</span><input required maxLength={120} value={invite.name} disabled={disabled} onChange={(event) => setInvite({ ...invite, name: event.target.value })} placeholder="Prénom Nom" /></label>
          <label className="form-field"><span>Adresse e-mail</span><input type="email" required maxLength={200} value={invite.email} disabled={disabled} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="prenom@entreprise.com" /></label>
          <label className="form-field"><span>Rôle</span><Select value={invite.role} disabled={disabled} onValueChange={(value) => setInvite({ ...invite, role: value as EditableRole })}><SelectTrigger className="pick" aria-label="Rôle de l’invité"><SelectValue /></SelectTrigger><SelectContent>{invitableRoles.map((value) => <SelectItem key={value} value={value}>{roleLabels[value]}</SelectItem>)}</SelectContent></Select></label>
          {invite.role === 'client' && <label className="form-field"><span>Client</span><Select value={invite.clientId || '__none'} disabled={disabled} onValueChange={(value) => setInvite({ ...invite, clientId: value === '__none' ? '' : value })}><SelectTrigger className="pick" aria-label="Client de l’invité"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Choisir un client</SelectItem>{activeClients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></label>}
          <button className="btn primary" disabled={disabled || (invite.role === 'client' && !invite.clientId)}><UserPlus size={15} />{saving ? 'Envoi…' : mailConfigured ? 'Envoyer l’invitation' : 'Créer l’accès'}</button>
        </form>
        <p className="team-role-description">{roleDescriptions[invite.role]}</p>
        {inviteError && <p className="form-error" role="alert">{inviteError}</p>}
        {invitation && <div className={`team-invitation ${invitation.sent ? 'sent' : ''}`} role="status">
          {invitation.sent
            ? <><MailCheck size={18} /><div><strong>Invitation envoyée à {invitation.email}</strong><p>Le mot de passe temporaire est dans l’e-mail. À sa première connexion, la personne choisira son mot de passe.</p></div></>
            : <><KeyRound size={18} /><div><strong>Accès créé pour {invitation.email}</strong>{invitation.error && <p className="form-error">{invitation.error}</p>}<p>Transmettez ces informations à la personne (elle changera le mot de passe à sa première connexion) :</p>
              <dl><div><dt>Adresse</dt><dd>{typeof window === 'undefined' ? '' : window.location.origin}</dd></div><div><dt>Identifiant</dt><dd>{invitation.email}</dd></div><div><dt>Mot de passe temporaire</dt><dd><code>{invitation.temporaryPassword}</code><button type="button" className="icon-button" aria-label="Copier le mot de passe temporaire" onClick={() => { void navigator.clipboard?.writeText(invitation.temporaryPassword ?? ''); }}><Copy size={13} /></button></dd></div></dl>
              <p>Il n’est affiché qu’une fois. Pour en générer un autre : « Renvoyer » sur la ligne du membre.</p></div></>}
          <button type="button" className="icon-button" aria-label="Fermer" onClick={() => setInvitation(null)}>×</button>
        </div>}
      </section>}
      <section className="team-card" aria-labelledby="team-members-title">
        <div className="section-head team-toolbar">
          <div><h2 id="team-members-title" tabIndex={-1}>Membres de l’équipe <span className="neutral-badge">{members.length}</span></h2><p>Votre rôle : {roleLabels[workspace.role]}</p></div>
          <div className="team-filters">
            <label className="search-input"><Search size={15} /><input aria-label="Rechercher un membre" placeholder="Nom ou e-mail…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger aria-label="Filtrer les membres par rôle" className="pick"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les rôles</SelectItem>{workspaceRoles.map((value) => <SelectItem key={value} value={value}>{roleLabels[value]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {visible.length ? <Table className="team-members-table">
          <TableHeader><TableRow><TableHead>Membre</TableHead><TableHead>Rôle</TableHead><TableHead className="team-date">Depuis le</TableHead><TableHead className="team-actions-heading">Accès</TableHead></TableRow></TableHeader>
          <TableBody>{visible.map((member) => {
            const name = memberName(member);
            const own = member.userId === currentUserId;
            const editable = allowed && member.role !== 'owner' && !own;
            return <TableRow key={member.userId}>
              <TableCell><div className="team-person"><Avatar name={name} /><div className="member-identity">
                <strong>{name} {own && <span className="neutral-badge">Vous</span>}{member.pending && <span className="neutral-badge"><Mail size={10} /> En attente de première connexion</span>}</strong>
                <small>{member.role === 'client' ? `Portail · ${clientName(member.clientId)}` : member.email || roleLabels[member.role]}{allowed && member.lastLoginAt ? ` · dernière connexion ${when(member.lastLoginAt)}` : ''}</small>
              </div></div></TableCell>
              <TableCell><span className="team-role-label">{roleLabels[member.role]}</span></TableCell>
              <TableCell className="team-date"><time dateTime={member.createdAt}>{new Date(member.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</time></TableCell>
              <TableCell><div className="team-member-actions">{editable ? <>
                <button className="btn" disabled={disabled} aria-label={`Modifier le rôle de ${name}`} onClick={(event) => { opener.current = event.currentTarget; setRole(member.role as EditableRole); setRoleClient(member.clientId || ''); setSaveError(''); setEditing(member); }}>Modifier</button>
                <button className="btn" disabled={disabled} aria-label={`Renvoyer l’invitation à ${name}`} title="Nouveau mot de passe temporaire" onClick={(event) => { opener.current = event.currentTarget; setSaveError(''); setRenewing(member); }}><Mail size={14} />{member.pending ? 'Renvoyer' : 'Réinitialiser'}</button>
                <button className="icon-button team-remove" disabled={disabled} aria-label={`Retirer ${name} de l’espace`} onClick={(event) => { opener.current = event.currentTarget; setSaveError(''); setRemoving(member); }}><Trash2 size={16} /></button>
              </> : <span className="team-access-note"><Lock size={13} />{member.role === 'owner' ? 'Protégé' : own ? 'Votre accès' : 'Consultation'}</span>}</div></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table> : <Empty><EmptyHeader><Users size={24} /><EmptyTitle>{members.length ? 'Aucun résultat' : 'Aucun membre disponible'}</EmptyTitle><EmptyDescription>{members.length ? 'Essayez un autre nom ou un autre rôle.' : 'Actualisez pour recharger les membres de cet espace.'}</EmptyDescription></EmptyHeader>{members.length > 0 && <button className="btn" onClick={() => { setSearch(''); setFilter('all'); }}>Effacer les filtres</button>}</Empty>}
      </section>
      <div className="team-lower">
        <section><h2>Qui peut faire quoi ?</h2><p>Les accès sont vérifiés à chaque action.</p>
          <div className="team-permissions">{workspaceRoles.filter((value) => value !== 'viewer' || members.some((m) => m.role === 'viewer')).map((value) => <div key={value}><ShieldCheck size={16} /><div><strong>{roleLabels[value]}</strong><p>{roleDescriptions[value]}</p></div></div>)}</div>
        </section>
        <section className="team-tip"><span className="onboarding-icon"><Lock size={20} /></span><h3>Un accès à tout l’espace</h3><p>Un « Membre » travaille sur les tâches qui lui sont assignées. Un accès « Client » ne voit que le portail de son client : livrables, validation, retours, demandes et calendrier.</p><p>Chaque accès est créé ici avec un mot de passe temporaire ; la personne le remplace à sa première connexion. Mot de passe oublié ? « Réinitialiser » lui en envoie un nouveau.</p></section>
      </div>
    </>}
    <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
      <DialogContent className="tracker-modal team-modal" onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
        <DialogHeader><DialogTitle>Modifier le rôle</DialogTitle><DialogDescription>{editing && memberName(editing)} · Le nouvel accès prend effet dès l’enregistrement.</DialogDescription></DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); if (editing) void save({ action: 'set-member-role', userId: editing.userId, expectedRole: editing.role, role, ...(role === 'client' ? { clientId: roleClient } : {}) }); }}>
          <label className="form-field"><span>Rôle dans l’espace</span><Select value={role} disabled={disabled} onValueChange={(value) => setRole(value as EditableRole)}><SelectTrigger className="pick" aria-label="Nouveau rôle"><SelectValue /></SelectTrigger><SelectContent>{[...invitableRoles, ...(editing?.role === 'viewer' ? ['viewer' as const] : [])].map((value) => <SelectItem key={value} value={value}>{roleLabels[value]}</SelectItem>)}</SelectContent></Select></label>
          {role === 'client' && <label className="form-field"><span>Client</span><Select value={roleClient || '__none'} disabled={disabled} onValueChange={(value) => setRoleClient(value === '__none' ? '' : value)}><SelectTrigger className="pick" aria-label="Client"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Choisir un client</SelectItem>{activeClients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></label>}
          <p className="team-role-description">{roleDescriptions[role]}</p>
          {saveError && <p className="form-error" role="alert">{saveError}</p>}
          <DialogFooter className="modal-footer"><button className="btn" type="button" disabled={saving} onClick={() => setEditing(null)}>Annuler</button><button className="btn primary" disabled={disabled || !allowed || (role === editing?.role && roleClient === (editing?.clientId || '')) || (role === 'client' && !roleClient)}>{saving ? 'Enregistrement…' : 'Enregistrer le rôle'}</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!renewing} onOpenChange={(open) => { if (!open && !saving) setRenewing(null); }}>
      <AlertDialogContent className="team-modal" onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>{renewing?.pending ? 'Renvoyer l’invitation ?' : 'Réinitialiser le mot de passe ?'}</AlertDialogTitle><AlertDialogDescription>{renewing && memberName(renewing)} recevra un nouveau mot de passe temporaire{mailConfigured ? ' par e-mail' : ' (affiché ici, à transmettre)'}. L’ancien mot de passe et ses sessions en cours cessent de fonctionner immédiatement.</AlertDialogDescription></AlertDialogHeader>
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel><AlertDialogAction disabled={disabled || !allowed} onClick={(event) => { event.preventDefault(); void renew(); }}>{saving ? 'Envoi…' : 'Confirmer'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={!!removing} onOpenChange={(open) => { if (!open && !saving) setRemoving(null); }}>
      <AlertDialogContent className="team-modal" onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.isConnected ? opener.current.focus() : document.getElementById('team-members-title')?.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>Retirer l’accès à cet espace ?</AlertDialogTitle><AlertDialogDescription>{removing && memberName(removing)} ne pourra plus accéder aux clients, projets et tâches de cet espace. Ses contributions seront conservées. Rétablir cet accès nécessitera une nouvelle invitation ; ce parcours n’est pas encore disponible.</AlertDialogDescription></AlertDialogHeader>
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel><AlertDialogAction className="team-confirm-remove" disabled={disabled || !allowed} onClick={(event) => { event.preventDefault(); if (removing) void save({ action: 'remove-member', userId: removing.userId, expectedRole: removing.role }); }}>{saving ? 'Retrait…' : 'Retirer l’accès'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
