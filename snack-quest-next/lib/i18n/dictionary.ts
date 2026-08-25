import { en, type Dictionary } from './dictionaries/en';
import { zhCN } from './dictionaries/zh-CN';
import { DEFAULT_LOCALE, type Locale } from './locales';

const DICTIONARIES: Record<Locale, Dictionary> = {
  en,
  'zh-CN': zhCN,
};

/**
 * Both dictionaries are plain objects imported directly rather than
 * `await import()`ed per request. Two languages of UI labels is a few
 * kilobytes — small enough that the complexity of async loading, and
 * the risk of a page rendering before its words arrive, costs more
 * than it saves. Revisit if this grows to a dozen languages.
 */
export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/**
 * Fills `{name}` placeholders. Deliberately tiny: the alternative is a
 * formatting library, and nothing here needs plurals or genders that
 * English and Chinese disagree about — Chinese has no plural
 * inflection at all, which is exactly why "{days} 天" works where an
 * English "{days} days" would need care.
 */
export function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
