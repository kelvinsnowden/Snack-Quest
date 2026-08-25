'use client';

import { createContext, useContext, useMemo } from 'react';
import { getDictionary, interpolate } from '@/lib/i18n/dictionary';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales';
import type { Dictionary } from '@/lib/i18n/dictionaries/en';

interface LocaleContextValue {
  locale: Locale;
  dict: Dictionary;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  dict: getDictionary(DEFAULT_LOCALE),
});

/**
 * Carries the server's chosen language into Client Components
 * (§ Admin in Simplified Chinese).
 *
 * The sidebar, the tables and the dialogs are all client-side, and
 * they are most of what a person reads. Passing the locale down as a
 * prop through every one of them would be a change to dozens of
 * component signatures for a value none of them vary; a context is
 * what a value like that is for.
 *
 * Seeded from the server's own `getLocale`, so client and server agree
 * on the first render and there is no hydration mismatch and no
 * flash of the wrong language.
 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, dict: getDictionary(locale) }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
}

/**
 * The dictionary, plus `t` for the strings that take a value.
 *
 * `dict` is returned directly rather than hidden behind a
 * string-keyed `t('nav.orders')` lookup, so a mistyped key is a
 * compile error at the call site instead of an empty label in
 * production. `t` exists only for templates with `{placeholders}`.
 */
export function useI18n(): { dict: Dictionary; t: (template: string, values?: Record<string, string | number>) => string } {
  const { dict } = useContext(LocaleContext);
  return { dict, t: interpolate };
}
