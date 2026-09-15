export const workspaceRoles = ['owner', 'admin', 'creative', 'viewer', 'client'] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];
export type EditableRole = Exclude<WorkspaceRole, 'owner'>;
export type WorkspaceContext = { id: string; name: string; role: WorkspaceRole; clientId?: string | null };
export type WorkspaceSummary = { id: string; name: string; role: WorkspaceRole };
export type WorkspaceMember = {
  userId: string;
  role: WorkspaceRole;
  name: string | null;
  email: string | null;
  clientId?: string | null;
  inviteCode?: string | null;   // only sent to owners/admins, only for pending invitations
  createdAt: string;
};
export type MemberChange =
  | { action: 'set-member-role'; userId: string; expectedRole: WorkspaceRole; role: EditableRole; clientId?: string }
  | { action: 'remove-member'; userId: string; expectedRole: WorkspaceRole }
  | { action: 'invite-member'; email: string; role: EditableRole; clientId?: string };

export const roleLabels: Record<WorkspaceRole, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  creative: 'Membre',
  viewer: 'Observateur',
  client: 'Client',
};
export const roleDescriptions: Record<WorkspaceRole, string> = {
  owner: 'Unique. Tout l’espace, le pilotage et la gestion des membres.',
  admin: 'Comme le propriétaire, sauf le rôle lui-même : clients, projets, tâches, archivage, verrou J−7, pilotage, invitations.',
  creative: 'Clients, sous-projets et tâches. Voit les tâches qui lui sont assignées et celles à prendre. Pilotage sur son périmètre. Ni équipe, ni archivage.',
  viewer: 'Lecture seule de tout l’espace, sans modification ni commentaire.',
  client: 'Portail client uniquement : ses livrables, validation, retours, demandes et calendrier. Rien d’autre.',
};
/** Roles offered when inviting; the owner is unique and `viewer` is kept only for existing memberships. */
export const invitableRoles: EditableRole[] = ['creative', 'admin', 'client'];
export const isManager = (role: WorkspaceRole) => role === 'owner' || role === 'admin';
export const isWorkspaceRole = (value: unknown): value is WorkspaceRole =>
  typeof value === 'string' && workspaceRoles.some((role) => role === value);
export const canManageMembers = (role: WorkspaceRole) => role === 'owner' || role === 'admin';
export const isStudioRole = (role: WorkspaceRole) => role !== 'client';
export const isInvite = (userId: string) => userId.startsWith('invite:');
export const inviteId = (email: string) => `invite:${email.trim().toLowerCase()}`;
export const memberName = (member: WorkspaceMember) => member.name || member.email || 'Membre sans profil';
