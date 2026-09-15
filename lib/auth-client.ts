export async function signOut() {
  const response = await fetch('/api/auth/signout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!response.ok) throw new Error('Déconnexion impossible. Réessayez.');
  window.location.assign('/');
}
