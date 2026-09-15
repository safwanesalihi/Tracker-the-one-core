'use client';
// Annexe contractuelle — The One Flow. Printable; the numbers come from lib/flow.ts so the annex and the app never disagree.
import { ArrowLeft, Printer } from 'lucide-react';
import { flow } from '@/lib/flow';

export default function Annex({ studio, client, onBack }: { studio: string; client?: string; onBack: () => void }) {
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return <div className="annex">
    <div className="annex-tools no-print"><button className="text-link back" onClick={onBack}><ArrowLeft size={15} />Retour</button><button className="btn" onClick={() => window.print()}><Printer size={15} />Imprimer / PDF</button></div>
    <article className="annex-document">
      <header><img src="/the-one-core-logo.svg" alt="The One Core" /><div><span className="eyebrow">ANNEXE CONTRACTUELLE</span><h1>The One Flow — Règles de collaboration</h1><p>{studio}{client ? ` × ${client}` : ''} · Version 1.0 · {today}</p></div></header>
      <p className="annex-intro">Cette annexe précise la manière dont les contenus sont produits, validés et publiés. Elle protège le calendrier du client autant que le travail du studio. Elle complète le contrat de prestation et prévaut en cas de silence de celui-ci sur ces points.</p>
      <ol className="annex-rules">
        <li><strong>Un seul canal.</strong> Les briefs, retours et validations passent par le portail client de {studio}. Un message envoyé ailleurs (WhatsApp, e-mail, appel) est consigné par le studio dans le portail avant d’être traité ; c’est la version du portail qui fait foi.</li>
        <li><strong>Validation en {flow.validationHours} heures.</strong> À réception d’un livrable dans le portail, le client dispose de {flow.validationHours} heures pour le valider ou demander des modifications. Des rappels sont envoyés à {flow.reminderHoursLeft.map((h) => `${h} h`).join(' puis ')} de l’échéance. <em>Le silence vaut validation :</em> passé ce délai, le livrable est considéré comme validé, la date et l’heure sont enregistrées, et le studio peut le publier.</li>
        <li><strong>{flow.maxRevisionRounds} tours de retours consolidés.</strong> Chaque livrable inclut {flow.maxRevisionRounds} tours de modifications. Un tour = une seule demande regroupant l’ensemble des remarques. Toute demande au-delà du tour {flow.maxRevisionRounds} est hors forfait : elle est chiffrée séparément et démarre après accord écrit du client.</li>
        <li><strong>Verrou J−{flow.lockDays}.</strong> Le calendrier de publication est gelé {flow.lockDays} jours avant chaque date. Aucun contenu n’est ajouté ni déplacé dans cette fenêtre, sauf accord exprès du studio ; ce déblocage est enregistré et peut être facturé.</li>
        <li><strong>Quatre jalons par contenu.</strong> Pour une publication le jour J : {flow.gates.map((g) => `${g.label.toLowerCase()} à J−${g.offset}`).join(', ')}. Le client s’engage à fournir les éléments nécessaires au jalon « brief validé » ; le studio s’engage à livrer au jalon « envoi au client ».</li>
        <li><strong>Réserve evergreen.</strong> Le studio maintient {flow.evergreenTarget} contenus validés et sans date par client. Ils sont publiés pour combler un trou de calendrier ou compenser un retard de validation, sans nouvelle validation.</li>
        <li><strong>Demandes de contenus.</strong> Toute nouvelle demande est saisie dans le formulaire du portail. Elle est planifiée selon le calendrier convenu et le forfait mensuel ; les demandes à moins de {flow.lockDays} jours sont traitées selon les disponibilités.</li>
        <li><strong>Preuve.</strong> Chaque validation, explicite ou tacite, fait l’objet d’un reçu daté (contact, mode de validation, nombre de tours utilisés) conservé dans le portail et accessible aux deux parties.</li>
      </ol>
      <div className="annex-signatures"><div><span>Pour {studio}</span><i /></div><div><span>Pour le client{client ? ` — ${client}` : ''}</span><i /></div></div>
      <footer>Document généré par The One Tracker. Les délais sont exprimés en heures et jours calendaires, heure de Casablanca.</footer>
    </article>
  </div>;
}
