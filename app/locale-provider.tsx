'use client';
// Provides the current language to every screen and mirrors it on <html lang dir>.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { detectLocale, localeMeta, storeLocale, translate, type Locale } from '@/lib/i18n';

type Vars = Record<string, string | number>;
type I18n = {
  locale: Locale; dir: 'ltr' | 'rtl'; tag: string; rtl: boolean;
  t: (text: string, vars?: Vars) => string;
  setLocale: (locale: Locale) => void;
  /** Formats a day key (YYYY-MM-DD) or ISO timestamp in the current language. */
  date: (value?: string, options?: Intl.DateTimeFormatOptions) => string;
};

const fallback: I18n = {
  locale: 'fr', dir: 'ltr', tag: 'fr-FR', rtl: false,
  t: (text, vars) => translate('fr', text, vars), setLocale: () => undefined,
  date: (value, options) => formatDate('fr-FR', value, options),
};
const LocaleContext = createContext<I18n>(fallback);

export function formatDate(tag: string, value?: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  if (!value) return '';
  const d = new Date(value.length === 10 ? value + 'T12:00:00' : value);
  return Number.isNaN(d.valueOf()) ? '' : d.toLocaleDateString(tag, options);
}

export function LocaleProvider({ children, initial }: { children: React.ReactNode; initial?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initial ?? 'fr');
  // The stored preference is only known in the browser; apply it after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the stored choice is read after hydration on purpose (server renders French)
  useEffect(() => { if (!initial) setLocaleState(detectLocale()); }, [initial]);
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('lang', locale); root.setAttribute('dir', localeMeta[locale].dir);
  }, [locale]);
  const setLocale = useCallback((next: Locale) => { storeLocale(next); setLocaleState(next); }, []);
  const value = useMemo<I18n>(() => ({
    locale, dir: localeMeta[locale].dir, tag: localeMeta[locale].tag, rtl: localeMeta[locale].dir === 'rtl',
    t: (text, vars) => translate(locale, text, vars), setLocale,
    date: (v, options) => formatDate(localeMeta[locale].tag, v, options),
  }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useI18n = () => useContext(LocaleContext);
