'use client';

import { useEffect, useState } from 'react';
import { Check, KeyRound, Loader2, Lock } from 'lucide-react';
import LoginShowcase from '@/app/login-showcase';
import { useI18n } from '@/app/locale-provider';

type Step = 'sign-in' | 'change-password';

export default function Login({ initialStep = 'sign-in', email: knownEmail = '' }: { initialStep?: Step; email?: string }) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>(initialStep);
  // Only asked when the temporary password was not typed on this very screen (gate reached after a reload).
  const [askCurrent] = useState(initialStep === 'change-password');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email: knownEmail, password: '', newPassword: '', confirm: '' });
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: event.target.value }));

  useEffect(() => {
    let active = true;
    fetch('/api/auth/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: { passwordConfigured?: unknown }) => { if (active) setConfigured(data.passwordConfigured === true); })
      .catch(() => { if (active) setConfigured(false); });
    return () => { active = false; };
  }, []);

  async function call(body: Record<string, string>) {
    const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json() as { error?: string; mustChangePassword?: boolean };
    if (!response.ok) throw new Error(t(data.error || 'Connexion impossible. Réessayez.'));
    return data;
  }

  // The form lives both at "/" (inside the tracker) and at "/login": land on the studio home either way.
  function enter() {
    if (window.location.pathname === '/') { window.location.hash = '#home'; window.location.reload(); }
    else window.location.replace('/#home');
  }

  async function submitSignIn(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const data = await call({ action: 'sign-in', email: form.email, password: form.password });
      if (data.mustChangePassword) { setStep('change-password'); setBusy(false); return; }
      enter();
    } catch (error) { setError((error as Error).message); setBusy(false); }
  }

  async function submitChange(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (form.newPassword !== form.confirm) { setError(t('Les deux mots de passe ne correspondent pas.')); return; }
    setBusy(true); setError('');
    try {
      await call({ action: 'change-password', currentPassword: form.password, newPassword: form.newPassword });
      enter();
    } catch (error) { setError((error as Error).message); setBusy(false); }
  }

  return <div className="auth-screen">
    <div className="auth-form google-login">
      <img className="auth-logo" src="/the-one-core-logo.svg" alt="The One Core" />
      {step === 'sign-in' ? <>
        <h1>{t('Bienvenue')}<span className="wordmark-dot">.</span></h1>
        <p>{t('L’espace de suivi et de validation de The One Core — pour l’équipe comme pour ses clients.')}</p>
        <form className="auth-password" onSubmit={submitSignIn} aria-label={t('Se connecter')}>
          <label><span>{t('Adresse e-mail')}</span><input type="email" required maxLength={200} autoComplete="email" value={form.email} onChange={set('email')} placeholder={t('vous@entreprise.com')} /></label>
          <label><span>{t('Mot de passe')}</span><input type="password" required maxLength={200} autoComplete="current-password" value={form.password} onChange={set('password')} placeholder="••••••••••" /></label>
          <button className="btn primary auth-submit" disabled={configured !== true || busy}>
            {busy ? <Loader2 size={18} className="spin" /> : <Lock size={16} />}{t('Se connecter')}</button>
        </form>
        <p className="google-login-note">{t('Accès sur invitation. Vos identifiants vous ont été transmis par The One Core ; à la première connexion, vous choisissez votre mot de passe. Mot de passe oublié ? Demandez au studio de renvoyer une invitation.')}</p>
      </> : <>
        <h1>{t('Choisissez votre mot de passe')}<span className="wordmark-dot">.</span></h1>
        <p>{form.email ? t('Bienvenue, {email}. ', { email: form.email }) : ''}{t('Le mot de passe temporaire ne sert qu’une fois : choisissez maintenant le vôtre (10 caractères minimum).')}</p>
        <form className="auth-password" onSubmit={submitChange} aria-label={t('Choisir un mot de passe')}>
          {askCurrent && <label><span>{t('Mot de passe actuel')}</span><input type="password" required maxLength={200} autoComplete="current-password" value={form.password} onChange={set('password')} /></label>}
          <label><span>{t('Nouveau mot de passe')}</span><input type="password" required minLength={10} maxLength={200} autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} placeholder={t('10 caractères minimum')} /></label>
          <label><span>{t('Confirmez le mot de passe')}</span><input type="password" required minLength={10} maxLength={200} autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></label>
          <button className="btn primary auth-submit" disabled={busy}>
            {busy ? <Loader2 size={18} className="spin" /> : <Check size={16} />}{t('Enregistrer et entrer')}</button>
        </form>
        <p className="google-login-note"><KeyRound size={13} />{' '}{t('Ce mot de passe vous servira pour toutes vos prochaines connexions.')}</p>
      </>}
      {configured === false && <div className="auth-setup" role="status"><strong>{t('Connexion non configurée')}</strong><p>{t('L’adresse de l’application (AUTH_URL) doit être définie côté serveur.')}</p></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <small className="auth-privacy"><Lock size={14} />{t('Vos données restent privées. Les mots de passe sont stockés hachés et jamais en clair.')}</small>
    </div>
    <div className="auth-flow"><div className="auth-preview">
      <h2>{t('Tout le travail')}<br />{t('au même endroit.')}</h2>
      <LoginShowcase />
    </div></div>
  </div>;
}
