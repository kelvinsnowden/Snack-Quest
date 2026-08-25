import 'server-only';

import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isSupportedLocale, type Locale } from './locales';

/**
 * The language this request should render in (§ Admin in Simplified
 * Chinese).
 *
 * Read on the server so the very first paint is already in the right
 * language — a portal that flashes English and then swaps would be
 * worse than one that never offered the choice, particularly in front
 * of somebody being shown the product for the first time.
 *
 * An unrecognised or absent cookie means English. That covers a
 * tampered value, a locale removed in a later deploy, and the ordinary
 * first visit, all with the same answer and no error path.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE_NAME)?.value;
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}
