'use client';

import { useEffect, useRef, useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { startGoogleSignIn } from '@/lib/auth-client';
import LoginShowcase from '@/app/login-showcase';

const errors: Record<string, string> = {
  AccessDenied: 'Accès sur invitation uniquement. Cette adresse Google n’a pas été invitée par le studio (ou son e-mail n’est pas vérifié).',
  InviteCodeRequired: 'Cette adresse a bien une invitation : saisissez le code d’invitation fourni par le studio, puis continuez avec Google.',
  InvalidInviteCode: 'Code d’invitation invalide pour cette adresse Google. Vérifiez le code auprès du studio.',
  UsePassword: 'Cette adresse a déjà un compte avec mot de passe. Connectez-vous avec votre e-mail et votre mot de passe.',
  OAuthAccountNotLinked: 'Ce compte n’est pas lié à cet espace. Contactez le propriétaire.',
  OAuthCallbackError: 'La connexion a expiré ou n’a pas pu être vérifiée. Réessayez.',
  Configuration: 'La connexion Google n’est pas encore configurée.',
};

type Status = { google: boolean; password: boolean } | null;

export default function Login() {
  const [configured, setConfigured] = useState<Status>(null);
  const [busy, setBusy] = useState(false);          // password form
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [form, setForm] = useState({ email: '', password: '', name: '', inviteCode: '' });
  const [withCode, setWithCode] = useState(false);
  const starting = useRef(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function checkConfiguration(callbackError?: string | null) {
    try {
      const response = await fetch('/api/auth/status', { cache: 'no-store' });
      if (!response.ok) throw new Error('Impossible de vérifier la connexion. Réessayez.');
      const data = await response.json() as { googleConfigured?: unknown; passwordConfigured?: unknown };
      setConfigured({ google: data.googleConfigured === true, password: data.passwordConfigured === true });
      if (callbackError) setError(errors[callbackError] || 'La connexion Google n’a pas abouti. Réessayez.');
    } catch (error) { setError((error as Error).message); setConfigured({ google: false, password: false }); }
  }
  useEffect(() => {
    // The Google callback reports failures through ?error=…; surface it once the status check settles.
    void checkConfiguration(new URLSearchParams(window.location.search).get('error'));
  }, []);

  async function signInWithGoogle() {
    if (starting.current) return;
    starting.current = true;
    setGoogleBusy(true); setError('');
    try { await startGoogleSignIn(withCode ? form.inviteCode : undefined); }
    catch (error) { setError((error as Error).message); setGoogleBusy(false); starting.current = false; }
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, email: form.email, password: form.password,
          ...(mode === 'sign-up' ? { name: form.name } : {}), ...(withCode && form.inviteCode ? { inviteCode: form.inviteCode } : {}) }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Connexion impossible. Réessayez.');
      // The session cookie is set; reload so the app fetches the workspace (a hash change alone would not).
      window.location.hash = '#home';
      window.location.reload();
    } catch (error) { setError((error as Error).message); setBusy(false); }
  }

  const ready = configured !== null;
  return <div className="auth-screen">
    <div className="auth-form google-login">
      <img className="auth-logo" src="/the-one-core-logo.svg" alt="The One Core" />
      <h1>{mode === 'sign-up' ? 'Première connexion' : 'Bienvenue'}<span className="wordmark-dot">.</span></h1>
      <p>{mode === 'sign-up'
        ? 'Créez votre accès avec le code d’invitation transmis par The One Core.'
        : 'L’espace de suivi et de validation de The One Core — pour l’équipe comme pour ses clients.'}</p>

      <form className="auth-password" onSubmit={submitPassword} aria-label={mode === 'sign-up' ? 'Créer un compte' : 'Se connecter'}>
        <div className="auth-mode" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'sign-in'} className={mode === 'sign-in' ? 'active' : ''} onClick={() => { setMode('sign-in'); setError(''); }}>Se connecter</button>
          <button type="button" role="tab" aria-selected={mode === 'sign-up'} className={mode === 'sign-up' ? 'active' : ''} onClick={() => { setMode('sign-up'); setError(''); }}>Créer un compte</button>
        </div>
        {mode === 'sign-up' && <label><span>Nom</span><input required maxLength={120} autoComplete="name" value={form.name} onChange={set('name')} placeholder="Prénom Nom" /></label>}
        <label><span>Adresse e-mail</span><input type="email" required maxLength={200} autoComplete="email" value={form.email} onChange={set('email')} placeholder="vous@entreprise.com" /></label>
        <label><span>Mot de passe</span><input type="password" required minLength={mode === 'sign-up' ? 10 : 1} maxLength={200} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} placeholder={mode === 'sign-up' ? '10 caractères minimum' : '••••••••••'} /></label>
        {withCode
          ? <label><span>Code d’invitation</span><input maxLength={20} autoComplete="off" value={form.inviteCode} onChange={set('inviteCode')} placeholder="ABCD-EFGH" style={{ textTransform: 'uppercase' }} /></label>
          : <button type="button" className="text-link auth-code-toggle" onClick={() => setWithCode(true)}>J’ai un code d’invitation (première connexion)</button>}
        <button className="btn primary auth-submit" disabled={!ready || !configured?.password || busy || googleBusy}>
          {busy ? <Loader2 size={18} className="spin" /> : <Lock size={16} />}
          {mode === 'sign-up' ? 'Créer mon compte' : 'Se connecter'}
        </button>
      </form>

      <div className="auth-divider"><span>ou</span></div>

      <button type="button" className="btn google-btn" disabled={!configured?.google || busy || googleBusy} onClick={signInWithGoogle}>
        {googleBusy || !ready ? <Loader2 size={20} className="spin" /> : <img src="/google-g.png" width={20} height={20} alt="" />}
        {googleBusy ? 'Redirection…' : 'Continuer avec Google'}
      </button>
      <p className="google-login-note">Accès sur invitation. À la première connexion, saisissez le code reçu du studio puis continuez avec Google ou créez un mot de passe ; ensuite, Google ou e-mail + mot de passe suffisent.</p>
      {configured?.google === false && ready && <div className="auth-setup" role="status"><strong>Configuration Google requise</strong><p>Le bouton Google sera disponible lorsque les identifiants Google de l’application auront été ajoutés.</p><button type="button" className="text-link" onClick={() => { setError(''); setConfigured(null); void checkConfiguration(); }}>Vérifier à nouveau</button></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <small className="auth-privacy"><Lock size={14} />Vos données restent privées. Les mots de passe sont stockés hachés et jamais en clair.</small>
    </div>
    <div className="auth-flow"><div className="auth-preview">
      <h2>Tout le travail<br />au même endroit.</h2>
      <LoginShowcase />
    </div></div>
  </div>;
}
