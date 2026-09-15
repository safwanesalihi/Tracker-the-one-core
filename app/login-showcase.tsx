'use client';
// Rotating showcase of the app's own components on the login screen. Static data, real CSS classes.
import { useEffect, useState } from 'react';
import { Check, Clock, FileText, Gauge, Megaphone, Send, ShieldCheck, Sparkles, X } from 'lucide-react';

const slides = [
  {
    key: 'pilotage', eyebrow: 'PILOTAGE', title: 'Les six nombres du studio', caption: 'Publiés à l’heure, délai de validation, tours de retours… avec leur cible.',
    render: () => <div className="showcase-tiles">
      {[['Publiés à l’heure', '96 %', '23 / 24 contenus', 'Cible ≥ 95 %', 'ok', Send], ['Délai médian de validation', '14 h', '11 décisions explicites', 'Cible < 24 h', 'ok', Clock], ['Validés par silence', '33 %', '4 / 12 validations tacites', 'À surveiller > 30 %', 'warn', Gauge]].map(([label, value, detail, target, state, Icon]) => {
        const I = Icon as typeof Send;
        return <div className={`flow-tile ${state}`} key={String(label)}><div className="metric-label"><span>{String(label)}</span><span className="metric-icon"><I size={16} /></span></div><strong>{String(value)}</strong><small>{String(detail)}</small><span className="flow-target">{String(target)}</span></div>;
      })}
    </div>,
  },
  {
    key: 'tasks', eyebrow: 'TÂCHES', title: 'Qui doit agir, tâche par tâche', caption: 'Le statut dit où en est le travail ; le camp dit à qui c’est de jouer.',
    render: () => <div className="showcase-rows task-rows">
      {[['Reel — Coulisses de l’atelier', 'Maison Noya', 1, 'studio', '18 sept.'], ['Carrousel — Nouvelle collection', 'Luma Skincare', 2, 'client', '19 sept.'], ['Affiche — Brunch du dimanche', 'Café Atlas', 3, 'done', '12 sept.']].map(([name, client, status, court, due]) =>
        <div className="task-line" key={String(name)}><span className="task-line-icon"><FileText size={15} /></span><span className="task-line-name"><strong>{String(name)}</strong><small>{String(client)}</small></span><span className={`status s${status}`}>{['À faire', 'En cours', 'À valider', 'Validé'][Number(status)]}</span><span className={`court ${court}`}><i />{court === 'studio' ? 'Studio' : court === 'client' ? 'Client' : 'Terminé'}</span><span className="due">{String(due)}</span></div>)}
    </div>,
  },
  {
    key: 'gates', eyebrow: 'JALONS', title: 'Quatre jalons avant chaque publication', caption: 'Brief à J−14, envoi à J−7, validation à J−5, prêt à J−1. Le calendrier se gèle une semaine avant.',
    render: () => <div className="gates showcase-gates">
      {[['Brief validé', 'J−14 · 8 sept.', 'reached'], ['Envoi au client', 'J−7 · 15 sept.', 'reached'], ['Validation client', 'J−5 · 17 sept.', 'late'], ['Prêt à publier', 'J−1 · 21 sept.', ''], ['Publication', 'J · 22 sept.', 'publish']].map(([label, when, state]) =>
        <div key={String(label)} className={state === 'publish' ? 'gate-publish' : String(state)}><span>{state === 'reached' ? <Check size={12} /> : state === 'late' ? <X size={12} /> : state === 'publish' ? <Megaphone size={12} /> : <Clock size={12} />}</span><strong>{String(label)}</strong><small>{String(when)}</small></div>)}
    </div>,
  },
  {
    key: 'portal', eyebrow: 'PORTAIL CLIENT', title: 'Le client valide, ou le silence valide', caption: 'Un compte à rebours de 48 h, deux tours de retours inclus, un seul canal.',
    render: () => <div className="showcase-portal">
      <div className="showcase-portal-head"><span className="status s2">À valider</span><strong>Visuels — Lancement de la gamme</strong><small>Communication · Septembre · Publication le 22 sept.</small></div>
      <div className="portal-clock"><Clock size={14} /><span>Sans réponse de votre part, ce livrable sera validé automatiquement dans 1 j 4 h.</span></div>
      <p className="portal-rounds">Tours de retours utilisés : 1 / 2</p>
      <div className="inline"><button type="button" className="btn" tabIndex={-1}>Demander des modifications</button><button type="button" className="btn primary" tabIndex={-1}><Check size={14} />Valider ce livrable</button></div>
    </div>,
  },
  {
    key: 'receipt', eyebrow: 'PREUVE', title: 'Chaque validation laisse un reçu', caption: 'Qui, quand, comment — explicite, tacite ou depuis le studio — et combien de tours ont été utilisés.',
    render: () => <div className="showcase-receipt">
      <div className="receipt"><ShieldCheck size={16} /><div><strong>Reçu de validation</strong><small>Validation explicite du client</small><small>Amina Benali · amina@centre-alkhaouarizmi.ma</small><small>17 sept., 10:42 · 1 tour utilisé</small></div></div>
      <div className="showcase-flags"><span className="flag-pill ok"><Megaphone size={11} />Publié le 22 sept.</span><span className="flag-pill"><Sparkles size={11} />Réserve evergreen : 3 / 3</span></div>
    </div>,
  },
];

export default function LoginShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(timer);
  }, [paused]);
  const slide = slides[index];
  return <div className="showcase" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-live="polite">
    <div className="showcase-frame" key={slide.key}>
      <div className="showcase-bar"><span /><span /><span /><small>the-one-core · {slide.eyebrow.toLowerCase()}</small></div>
      <div className="showcase-body">{slide.render()}</div>
    </div>
    <div className="showcase-copy">
      <div className="eyebrow">{slide.eyebrow}</div>
      <h3>{slide.title}</h3>
      <p>{slide.caption}</p>
    </div>
    <div className="showcase-dots" role="tablist" aria-label="Aperçus de l’application">
      {slides.map((s, i) => <button key={s.key} type="button" role="tab" aria-selected={i === index} aria-label={s.title} className={i === index ? 'active' : ''} onClick={() => setIndex(i)} />)}
    </div>
  </div>;
}
