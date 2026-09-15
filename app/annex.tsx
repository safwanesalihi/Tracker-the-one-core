'use client';
// Annexe contractuelle — The One Flow. Printable, in the app's current language; the numbers come from
// lib/flow.ts so the annex and the app never disagree.
import { ArrowLeft, Printer } from 'lucide-react';
import { flow } from '@/lib/flow';
import { useI18n } from '@/app/locale-provider';

export default function Annex({ studio, client, onBack }: { studio: string; client?: string; onBack: () => void }) {
  const { t, tag, locale } = useI18n();
  const today = new Date().toLocaleDateString(tag, { day: 'numeric', month: 'long', year: 'numeric' });
  const v = {
    studio, hours: flow.validationHours, rounds: flow.maxRevisionRounds, next: flow.maxRevisionRounds + 1, lock: flow.lockDays, evergreen: flow.evergreenTarget,
    reminders: flow.reminderHoursLeft.map((h) => t('{n} h', { n: h })).join(t(' puis ')),
    gates: flow.gates.map((g) => t('{gate} à J−{offset}', { gate: t(g.label).toLocaleLowerCase(tag), offset: g.offset })).join(', '),
  };
  return <div className="annex" lang={locale}>
    <div className="annex-tools no-print"><button className="text-link back" onClick={onBack}><ArrowLeft size={15} />{t('Retour')}</button><button className="btn" onClick={() => window.print()}><Printer size={15} />{t('Imprimer / PDF')}</button></div>
    <article className="annex-document">
      <header><img src="/the-one-core-logo.svg" alt="The One Core" /><div><span className="eyebrow">{t('ANNEXE CONTRACTUELLE')}</span><h1>{t('The One Flow — Règles de collaboration')}</h1><p>{studio}{client ? ` × ${client}` : ''} · {t('Version 1.0')} · {today}</p></div></header>
      <p className="annex-intro">{t('Cette annexe précise la manière dont les contenus sont produits, validés et publiés. Elle protège le calendrier du client autant que le travail du studio. Elle complète le contrat de prestation et prévaut en cas de silence de celui-ci sur ces points.')}</p>
      <ol className="annex-rules">
        <li><strong>{t('Un seul canal.')}</strong> {t('Les briefs, retours et validations passent par le portail client de {studio}. Un message envoyé ailleurs (WhatsApp, e-mail, appel) est consigné par le studio dans le portail avant d’être traité ; c’est la version du portail qui fait foi.', v)}</li>
        <li><strong>{t('Validation en {hours} heures.', v)}</strong> {t('À réception d’un livrable dans le portail, le client dispose de {hours} heures pour le valider ou demander des modifications. Des rappels sont envoyés à {reminders} de l’échéance.', v)} <em>{t('Le silence vaut validation :')}</em> {t('passé ce délai, le livrable est considéré comme validé, la date et l’heure sont enregistrées, et le studio peut le publier.')}</li>
        <li><strong>{t('{rounds} tours de retours consolidés.', v)}</strong> {t('Chaque livrable inclut {rounds} tours de modifications. Un tour = une seule demande regroupant l’ensemble des remarques. Toute demande au-delà du tour {rounds} est hors forfait : elle est chiffrée séparément et démarre après accord écrit du client.', v)}</li>
        <li><strong>{t('Verrou J−{lock}.', v)}</strong> {t('Le calendrier de publication est gelé {lock} jours avant chaque date. Aucun contenu n’est ajouté ni déplacé dans cette fenêtre, sauf accord exprès du studio ; ce déblocage est enregistré et peut être facturé.', v)}</li>
        <li><strong>{t('Quatre jalons par contenu.')}</strong> {t('Pour une publication le jour J : {gates}. Le client s’engage à fournir les éléments nécessaires au jalon « brief validé » ; le studio s’engage à livrer au jalon « envoi au client ».', v)}</li>
        <li><strong>{t('Réserve evergreen.')}</strong> {t('Le studio maintient {evergreen} contenus validés et sans date par client. Ils sont publiés pour combler un trou de calendrier ou compenser un retard de validation, sans nouvelle validation.', v)}</li>
        <li><strong>{t('Demandes de contenus.')}</strong> {t('Toute nouvelle demande est saisie dans le formulaire du portail. Elle est planifiée selon le calendrier convenu et le forfait mensuel ; les demandes à moins de {lock} jours sont traitées selon les disponibilités.', v)}</li>
        <li><strong>{t('Preuve.')}</strong> {t('Chaque validation, explicite ou tacite, fait l’objet d’un reçu daté (contact, mode de validation, nombre de tours utilisés) conservé dans le portail et accessible aux deux parties.')}</li>
      </ol>
      <div className="annex-signatures"><div><span>{t('Pour {studio}', v)}</span><i /></div><div><span>{t('Pour le client')}{client ? ` — ${client}` : ''}</span><i /></div></div>
      <footer>{t('Document généré par The One Tracker. Les délais sont exprimés en heures et jours calendaires, heure de Casablanca.')}</footer>
    </article>
  </div>;
}
