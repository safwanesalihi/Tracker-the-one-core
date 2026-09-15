'use client';
// Three-way language toggle (FR / EN / AR) shown in every sidebar and on the sign-in screen.
import { Languages } from 'lucide-react';
import { locales, localeMeta } from '@/lib/i18n';
import { useI18n } from '@/app/locale-provider';

export default function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return <div className={`language-switch ${compact ? 'compact' : ''}`} role="group" aria-label={t('Langue')}>
    {!compact && <Languages size={14} aria-hidden="true" />}
    {locales.map((l) => <button key={l} type="button" className={l === locale ? 'active' : ''} aria-pressed={l === locale} lang={l} title={localeMeta[l].label} onClick={() => setLocale(l)}>{localeMeta[l].short}</button>)}
  </div>;
}
