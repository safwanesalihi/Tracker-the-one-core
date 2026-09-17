export const workspaceRoles = ['owner', 'admin', 'creative', 'print_operator', 'viewer', 'client'] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];
export type EditableRole = Exclude<WorkspaceRole, 'owner'>;
export type WorkspaceContext = { id: string; name: string; role: WorkspaceRole; clientId?: string | null };
export type WorkspaceSummary = { id: string; name: string; role: WorkspaceRole };
export type WorkspaceMember = {
  userId: string;
  role: WorkspaceRole;
  name: string | null;
  email: string | null;
  avatar?: string | null;         // profile picture asset id
  clientId?: string | null;
  pending?: boolean | null;       // managers only: invited, never signed in yet
  lastLoginAt?: string | null;    // managers only
  createdAt: string;
};
export type Invitation = { email: string; sent: boolean; error?: string; temporaryPassword?: string; url: string; existingAccount?: boolean };
export type MemberChange =
  | { action: 'set-member-role'; userId: string; expectedRole: WorkspaceRole; role: EditableRole; clientId?: string }
  | { action: 'remove-member'; userId: string; expectedRole: WorkspaceRole }
  | { action: 'invite-member'; email: string; name?: string; role: EditableRole; clientId?: string }
  | { action: 'renew-invitation'; userId: string };

export const roleLabels: Record<WorkspaceRole, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  creative: 'Membre',
  print_operator: 'Opérateur impression',
  viewer: 'Observateur',
  client: 'Client',
};
export const roleDescriptions: Record<WorkspaceRole, string> = {
  owner: 'Unique. Tout l’espace, le tableau de bord et la gestion des membres.',
  admin: 'Gère les clients existants, projets, tâches, archivage, verrou J−7, tableau de bord et invitations. La création de clients est réservée au propriétaire.',
  creative: 'Fait avancer ses tâches ou celles à prendre, commente et gère les sous-projets. Équipe en lecture seule. Ni création ni modification de clients, ni création de tâches, ni validation client, ni archivage, ni tableau de bord.',
  print_operator: 'Fait avancer ses tâches d’impression ou celles à prendre, commente et gère les sous-projets. Équipe en lecture seule. Ni création ni modification de clients, ni création de tâches, ni validation client, ni archivage, ni tableau de bord.',
  viewer: 'Lecture seule de tout l’espace, sans modification ni commentaire.',
  client: 'Portail client uniquement : ses livrables, validation, retours, demandes et calendrier. Rien d’autre.',
};
/** Roles offered when inviting into a normal (content) workspace; the print workspace uses `invitableRolesFor` instead. */
const contentInvitableRoles: EditableRole[] = ['creative', 'admin', 'client'];
/** Roles offered when inviting into the print workspace — no client portal there in v1. */
const printInvitableRoles: EditableRole[] = ['print_operator', 'admin'];
export const isManager = (role: WorkspaceRole) => role === 'owner' || role === 'admin';
export const isWorkspaceRole = (value: unknown): value is WorkspaceRole =>
  typeof value === 'string' && workspaceRoles.some((role) => role === value);
export const canManageMembers = (role: WorkspaceRole) => role === 'owner' || role === 'admin';
export const isStudioRole = (role: WorkspaceRole) => role !== 'client';
/** The operational "does the work" roles — same permissions everywhere, just scoped to a different workspace/role label. */
export const isMemberRole = (role: WorkspaceRole) => role === 'creative' || role === 'print_operator';
/** A workspace id ending in `:print` is the print workspace — see `printWorkspaceIdFor` in the records API. */
export const isPrintWorkspaceId = (id: string) => id.endsWith(':print');
export const invitableRolesFor = (workspaceId: string): EditableRole[] =>
  isPrintWorkspaceId(workspaceId) ? printInvitableRoles : contentInvitableRoles;
export const memberName = (member: WorkspaceMember) => member.name || member.email || 'Membre de l’équipe';
