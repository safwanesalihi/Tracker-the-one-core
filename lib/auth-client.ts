async function csrfToken() {
  const response = await fetch('/api/auth/csrf', { cache: 'no-store' });
  const data = await response.json() as { csrfToken?: unknown };
  if (!response.ok || typeof data.csrfToken !== 'string') throw new Error('La connexion est indisponible. Réessayez.');
  return data.csrfToken as string;
}

export async function startGoogleSignIn() {
  const token = await csrfToken();
  // Top-level form navigation lets Google handle passwords/consent in its own origin.
  const form = document.createElement('form');
  form.method = 'POST'; form.action = '/api/auth/signin/google'; form.target = '_top';
  for (const [name, value] of Object.entries({ csrfToken: token, callbackUrl: new URL('/#home', window.location.origin).href })) {
    const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.appendChild(input);
  }
  document.body.appendChild(form); form.submit(); form.remove();
}

export async function signOut() {
  const token = await csrfToken();
  const response = await fetch('/api/auth/signout', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
    body: new URLSearchParams({ csrfToken: token, callbackUrl: window.location.origin + '/' }),
  });
  if (!response.ok) throw new Error('Déconnexion impossible. Réessayez.');
  window.location.assign('/');
}
