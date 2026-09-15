'use client';
// Rotating showcase of the app's own components on the login screen. Static data, real CSS classes.
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/app/locale-provider';
import { Check, Clock, FileText, Gauge, Megaphone, Send, ShieldCheck, Sparkles, X } from 'lucide-react';

const buildSlides = (t: (text: string) => string) => [
  {
    key: 'pilotage', eyebrow: t('PILOTAGE'), title: t('Les six nombres du studio'), caption: t('Publiés à l’heure, délai de validation, tours de retours… avec leur cible.'),
    render: () => <div className="showcase-tiles">
      {[[t('Publiés à l’heure'), '96 %', t('23 / 24 contenus'), t('Cible ≥ 95 %'), 'ok', Send], [t('Délai médian de validation'), t('14 h'), t('11 décisions explicites'), t('Cible < 24 h'), 'ok', Clock], [t('Validés par silence'), '33 %', t('4 / 12 validations tacites'), t('À surveiller > 30 %'), 'warn', Gauge]].map(([label, value, detail, target, state, Icon]) => {
        const I = Icon as typeof Send;
        return <div className={`flow-tile ${state}`} key={String(label)}><div className="metric-label"><span>{String(label)}</span><span className="metric-icon"><I size={16} /></span></div><strong>{String(value)}</strong><small>{String(detail)}</small><span className="flow-target">{String(target)}</span></div>;
      })}
    </div>,
  },
  {
    key: 'tasks', eyebrow: t('TÂCHES'), title: t('Qui doit agir, tâche par tâche'), caption: t('Le statut dit où en est le travail ; le camp dit à qui c’est de jouer.'),
    render: () => <div className="showcase-rows task-rows">
      {[[t('Reel — Coulisses de l’atelier'), t('Maison Noya'), 1, 'studio', t('18 sept.')], [t('Carrousel — Nouvelle collection'), t('Luma Skincare'), 2, 'client', t('19 sept.')], [t('Affiche — Brunch du dimanche'), t('Café Atlas'), 3, 'done', t('12 sept.')]].map(([name, client, status, court, due]) =>
        <div className="task-line" key={String(name)}><span className="task-line-icon"><FileText size={15} /></span><span className="task-line-name"><strong>{String(name)}</strong><small>{String(client)}</small></span><span className={`status s${status}`}>{[t('À faire'), t('En cours'), t('À valider'), t('Validé')][Number(status)]}</span><span className={`court ${court}`}><i />{court === 'studio' ? t('Studio') : court === 'client' ? t('Client') : t('Terminé')}</span><span className="due">{String(due)}</span></div>)}
    </div>,
  },
  {
    key: 'gates', eyebrow: t('JALONS'), title: t('Quatre jalons avant chaque publication'), caption: t('Brief à J−14, envoi à J−7, validation à J−5, prêt à J−1. Le calendrier se gèle une semaine avant.'),
    render: () => <div className="gates showcase-gates">
      {[[t('Brief validé'), t('J−14 · 8 sept.'), 'reached'], [t('Envoi au client'), t('J−7 · 15 sept.'), 'reached'], [t('Validation client'), t('J−5 · 17 sept.'), 'late'], [t('Prêt à publier'), t('J−1 · 21 sept.'), ''], [t('Publication'), t('J · 22 sept.'), 'publish']].map(([label, when, state]) =>
        <div key={String(label)} className={state === 'publish' ? 'gate-publish' : String(state)}><span>{state === 'reached' ? <Check size={12} /> : state === 'late' ? <X size={12} /> : state === 'publish' ? <Megaphone size={12} /> : <Clock size={12} />}</span><strong>{String(label)}</strong><small>{String(when)}</small></div>)}
    </div>,
  },
  {
    key: 'portal', eyebrow: t('PORTAIL CLIENT'), title: t('Le client valide, ou le silence valide'), caption: t('Un compte à rebours de 48 h, deux tours de retours inclus, un seul canal.'),
    render: () => <div className="showcase-portal">
      <div className="showcase-portal-head"><span className="status s2">{t('À valider')}</span><strong>{t('Visuels — Lancement de la gamme')}</strong><small>{t('Communication · Septembre · Publication le 22 sept.')}</small></div>
      <div className="portal-clock"><Clock size={14} /><span>{t('Sans réponse de votre part, ce livrable sera validé automatiquement dans 1 j 4 h.')}</span></div>
      <p className="portal-rounds">{t('Tours de retours utilisés : 1 / 2')}</p>
      <div className="inline"><button type="button" className="btn" tabIndex={-1}>{t('Demander des modifications')}</button><button type="button" className="btn primary" tabIndex={-1}><Check size={14} />{t('Valider ce livrable')}</button></div>
    </div>,
  },
  {
    key: 'receipt', eyebrow: t('PREUVE'), title: t('Chaque validation laisse un reçu'), caption: t('Qui, quand, comment — explicite, tacite ou depuis le studio — et combien de tours ont été utilisés.'),
    render: () => <div className="showcase-receipt">
      <div className="receipt"><ShieldCheck size={16} /><div><strong>{t('Reçu de validation')}</strong><small>{t('Validation explicite du client')}</small><small>{t('Amina Benali · amina@centre-alkhaouarizmi.ma')}</small><small>{t('17 sept., 10:42 · 1 tour utilisé')}</small></div></div>
      <div className="showcase-flags"><span className="flag-pill ok"><Megaphone size={11} />{t('Publié le 22 sept.')}</span><span className="flag-pill"><Sparkles size={11} />{t('Réserve evergreen : 3 / 3')}</span></div>
    </div>,
  },
];

export default function LoginShowcase() {
  const { t, locale } = useI18n();
  const slides = useMemo(() => buildSlides(t), [t]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(timer);
  }, [paused, slides.length]);
  const slide = slides[index];
  return <div className="showcase" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-live="polite">
    <div className="showcase-frame" key={slide.key}>
      <div className="showcase-bar"><span /><span /><span /><small lang={locale}>the-one-core · {slide.eyebrow.toLocaleLowerCase(locale)}</small></div>
      <div className="showcase-body">{slide.render()}</div>
    </div>
    <div className="showcase-copy">
      <div className="eyebrow">{slide.eyebrow}</div>
      <h3>{slide.title}</h3>
      <p>{slide.caption}</p>
    </div>
    <div className="showcase-dots" role="tablist" aria-label={t('Aperçus de l’application')}>
      {slides.map((s, i) => <button key={s.key} type="button" role="tab" aria-selected={i === index} aria-label={s.title} className={i === index ? 'active' : ''} onClick={() => setIndex(i)} />)}
    </div>
  </div>;
}
