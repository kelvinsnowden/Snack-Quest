/**
 * Which languages the staff portal speaks (§ Admin in Simplified
 * Chinese).
 *
 * Admin only, deliberately. The public site sells to Kenyan customers
 * in English and translating it would be a different project with
 * different stakes — a mistranslated price or delivery promise is a
 * commercial problem, whereas a mistranslated admin label is an
 * inconvenience to someone who can switch back in one click.
 *
 * A cookie rather than a URL segment (`/zh-CN/admin/...`), because
 * every internal link, redirect and `router.push` in 56 admin pages
 * would otherwise need to carry the locale, and the one that forgot
 * would silently throw the reader back to English mid-task. The
 * language is a property of the person, not of the page.
 */
export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Read by the server on every admin render and written by the switcher. */
export const LOCALE_COOKIE_NAME = 'sq_admin_locale';

/** A year: this is a preference, not a session, and re-choosing it every week would be its own small insult. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** What each language calls itself — never the English name of it, which is no use to the person looking for their own. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
};

/** `lang` for the document, so screen readers and browser translation see the right language. */
export const LOCALE_HTML_LANG: Record<Locale, string> = {
  en: 'en',
  'zh-CN': 'zh-Hans',
};

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
