'use client';

import { useRef, useState } from 'react';
import { Copy, Lock, Mail, RefreshCw, Search, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import Avatar from '@/app/profile-avatar';
import { canManageMembers, isInvite, memberName, roleDescriptions, roleLabels, workspaceRoles, type EditableRole, type MemberChange, type WorkspaceContext, type WorkspaceMember } from '@/lib/workspace';
import type { RecordItem } from '@/lib/model';

type Props = {
  workspace: WorkspaceContext | null;
  members: WorkspaceMember[];
  clients?: RecordItem[];
  currentUserId: string;
  currentUserImage?: string | null;
  busy: boolean;
  onChange: (change: MemberChange) => Promise<void>;
  onRefresh: () => void;
};

export default function TeamPage({ workspace, members, clients = [], currentUserId, currentUserImage, busy, onChange, onRefresh }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<WorkspaceMember | null>(null);
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);
  const [role, setRole] = useState<EditableRole>('viewer');
  const [roleClient, setRoleClient] = useState('');
  const [invite, setInvite] = useState({ email: '', role: 'creative' as EditableRole, clientId: '' });
  const [inviteError, setInviteError] = useState('');
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
    inFlight.current = true; setSaving(true); setInviteError('');
    try {
      await onChange({ action: 'invite-member', email: invite.email, role: invite.role, ...(invite.role === 'client' ? { clientId: invite.clientId } : {}) });
      setInvite({ email: '', role: 'creative', clientId: '' });
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Invitation impossible. Réessayez.');
    } finally { inFlight.current = false; setSaving(false); }
  }
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
      <p>Les personnes qui font avancer vos projets.</p>
    </div>
    {!workspace ? <Empty className="team-card">
      <EmptyHeader><Lock size={24} /><EmptyTitle>Connectez votre espace</EmptyTitle>
        <EmptyDescription>Connectez-vous pour consulter et gérer votre équipe.</EmptyDescription>
      </EmptyHeader>
      <a className="btn primary" href="/login" target="_top">Se connecter</a>
    </Empty> : <>
      <div className="team-summary">
        {([['MEMBRES', members.filter((m) => !isInvite(m.userId)).length], ['GESTION DES ACCÈS', managers], ['LECTURE SEULE', viewers], ['ACCÈS CLIENT', members.filter((m) => m.role === 'client').length], ['INVITATIONS', members.filter((m) => isInvite(m.userId)).length]] as const).map(([label, value]) =>
          <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      {allowed && <section className="team-card team-invite" aria-labelledby="team-invite-title">
        <div className="section-head"><div><h2 id="team-invite-title">Inviter une personne</h2><p>Avec Google, l’invitation s’active à la première connexion avec cette adresse. Avec un mot de passe, la personne saisit le code d’invitation affiché ci-dessous. Aucun e-mail n’est envoyé par l’application : transmettez-lui le lien et le code vous-même.</p></div></div>
        <form className="team-invite-form" onSubmit={sendInvite}>
          <label className="form-field"><span>Adresse e-mail Google</span><input type="email" required maxLength={200} value={invite.email} disabled={disabled} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="prenom@entreprise.com" /></label>
          <label className="form-field"><span>Rôle</span><Select value={invite.role} disabled={disabled} onValueChange={(value) => setInvite({ ...invite, role: value as EditableRole })}><SelectTrigger className="pick" aria-label="Rôle de l’invité"><SelectValue /></SelectTrigger><SelectContent>{workspaceRoles.filter((value) => value !== 'owner').map((value) => <SelectItem key={value} value={value}>{roleLabels[value]}</SelectItem>)}</SelectContent></Select></label>
          {invite.role === 'client' && <label className="form-field"><span>Client</span><Select value={invite.clientId || '__none'} disabled={disabled} onValueChange={(value) => setInvite({ ...invite, clientId: value === '__none' ? '' : value })}><SelectTrigger className="pick" aria-label="Client de l’invité"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Choisir un client</SelectItem>{activeClients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></label>}
          <button className="btn primary" disabled={disabled || (invite.role === 'client' && !invite.clientId)}><UserPlus size={15} />{saving ? 'Enregistrement…' : 'Inviter'}</button>
        </form>
        <p className="team-role-description">{roleDescriptions[invite.role]}</p>
        {inviteError && <p className="form-error" role="alert">{inviteError}</p>}
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
              <TableCell><div className="team-person"><Avatar name={name} image={own ? currentUserImage : null} /><div className="member-identity">
                <strong>{name} {own && <span className="neutral-badge">Vous</span>}{isInvite(member.userId) && <span className="neutral-badge"><Mail size={10} /> Invitation en attente</span>}</strong>
                <small>{member.role === 'client' ? `Portail · ${clientName(member.clientId)}` : member.email || 'Profil disponible après sa première connexion'}</small>
                {isInvite(member.userId) && member.inviteCode && <small className="team-invite-code">Code d’invitation : <code>{member.inviteCode}</code><button type="button" className="icon-button" aria-label={`Copier le code ${member.inviteCode}`} onClick={() => { void navigator.clipboard?.writeText(member.inviteCode!); }}><Copy size={13} /></button></small>}
              </div></div></TableCell>
              <TableCell><span className="team-role-label">{roleLabels[member.role]}</span></TableCell>
              <TableCell className="team-date"><time dateTime={member.createdAt}>{new Date(member.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</time></TableCell>
              <TableCell><div className="team-member-actions">{editable ? <>
                <button className="btn" disabled={disabled} aria-label={`Modifier le rôle de ${name}`} onClick={(event) => { opener.current = event.currentTarget; setRole(member.role as EditableRole); setRoleClient(member.clientId || ''); setSaveError(''); setEditing(member); }}>Modifier</button>
                <button className="icon-button team-remove" disabled={disabled} aria-label={`Retirer ${name} de l’espace`} onClick={(event) => { opener.current = event.currentTarget; setSaveError(''); setRemoving(member); }}><Trash2 size={16} /></button>
              </> : <span className="team-access-note"><Lock size={13} />{member.role === 'owner' ? 'Protégé' : own ? 'Votre accès' : 'Consultation'}</span>}</div></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table> : <Empty><EmptyHeader><Users size={24} /><EmptyTitle>{members.length ? 'Aucun résultat' : 'Aucun membre disponible'}</EmptyTitle><EmptyDescription>{members.length ? 'Essayez un autre nom ou un autre rôle.' : 'Actualisez pour recharger les membres de cet espace.'}</EmptyDescription></EmptyHeader>{members.length > 0 && <button className="btn" onClick={() => { setSearch(''); setFilter('all'); }}>Effacer les filtres</button>}</Empty>}
      </section>
      <div className="team-lower">
        <section><h2>Qui peut faire quoi ?</h2><p>Les accès sont vérifiés à chaque action.</p>
          <div className="team-permissions">{workspaceRoles.map((value) => <div key={value}><ShieldCheck size={16} /><div><strong>{roleLabels[value]}</strong><p>{roleDescriptions[value]}</p></div></div>)}</div>
        </section>
        <section className="team-tip"><span className="onboarding-icon"><Lock size={20} /></span><h3>Un accès à tout l’espace</h3><p>Les membres du studio voient tout l’espace. Un accès « Client » ne voit que le portail de son client : livrables, validation, retours, demandes et calendrier.</p><p>L’application n’envoie aucun e-mail : partagez l’adresse du portail à la personne invitée. Elle se connecte avec Google, ou crée un mot de passe et saisit son code d’invitation.</p></section>
      </div>
    </>}
    <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
      <DialogContent className="tracker-modal team-modal" onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
        <DialogHeader><DialogTitle>Modifier le rôle</DialogTitle><DialogDescription>{editing && memberName(editing)} · Le nouvel accès prend effet dès l’enregistrement.</DialogDescription></DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); if (editing) void save({ action: 'set-member-role', userId: editing.userId, expectedRole: editing.role, role, ...(role === 'client' ? { clientId: roleClient } : {}) }); }}>
          <label className="form-field"><span>Rôle dans l’espace</span><Select value={role} disabled={disabled} onValueChange={(value) => setRole(value as EditableRole)}><SelectTrigger className="pick" aria-label="Nouveau rôle"><SelectValue /></SelectTrigger><SelectContent>{workspaceRoles.filter((value) => value !== 'owner').map((value) => <SelectItem key={value} value={value}>{roleLabels[value]}</SelectItem>)}</SelectContent></Select></label>
          {role === 'client' && <label className="form-field"><span>Client</span><Select value={roleClient || '__none'} disabled={disabled} onValueChange={(value) => setRoleClient(value === '__none' ? '' : value)}><SelectTrigger className="pick" aria-label="Client"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Choisir un client</SelectItem>{activeClients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></label>}
          <p className="team-role-description">{roleDescriptions[role]}</p>
          {saveError && <p className="form-error" role="alert">{saveError}</p>}
          <DialogFooter className="modal-footer"><button className="btn" type="button" disabled={saving} onClick={() => setEditing(null)}>Annuler</button><button className="btn primary" disabled={disabled || !allowed || (role === editing?.role && roleClient === (editing?.clientId || '')) || (role === 'client' && !roleClient)}>{saving ? 'Enregistrement…' : 'Enregistrer le rôle'}</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!removing} onOpenChange={(open) => { if (!open && !saving) setRemoving(null); }}>
      <AlertDialogContent className="team-modal" onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.isConnected ? opener.current.focus() : document.getElementById('team-members-title')?.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>Retirer l’accès à cet espace ?</AlertDialogTitle><AlertDialogDescription>{removing && memberName(removing)} ne pourra plus accéder aux clients, projets et tâches de cet espace. Ses contributions seront conservées. Rétablir cet accès nécessitera une nouvelle invitation ; ce parcours n’est pas encore disponible.</AlertDialogDescription></AlertDialogHeader>
        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel><AlertDialogAction className="team-confirm-remove" disabled={disabled || !allowed} onClick={(event) => { event.preventDefault(); if (removing) void save({ action: 'remove-member', userId: removing.userId, expectedRole: removing.role }); }}>{saving ? 'Retrait…' : 'Retirer l’accès'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
