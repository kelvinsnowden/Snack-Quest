import { describe, expect, it } from 'vitest';
import { en } from '@/lib/i18n/dictionaries/en';
import { zhCN } from '@/lib/i18n/dictionaries/zh-CN';
import { getDictionary, interpolate } from '@/lib/i18n/dictionary';
import { isSupportedLocale, LOCALE_LABELS, SUPPORTED_LOCALES } from '@/lib/i18n/locales';
import { ORDER_STATUS_LABELS } from '@/lib/orders/transitions';
import { ADMIN_NAV_ITEMS } from '@/components/admin/adminNav';

/**
 * The staff portal in Simplified Chinese (§ Admin in Simplified
 * Chinese).
 *
 * TypeScript already refuses a translation that invents or omits a
 * key. What it cannot see is the two failures that would actually
 * embarrass this: a Chinese entry left as English because nobody
 * noticed, and a navigation item added later with no key at all —
 * which renders in English inside an otherwise-Chinese menu.
 */

function leaves(value: unknown, path: string[] = []): { path: string; value: string }[] {
  if (typeof value === 'string') return [{ path: path.join('.'), value }];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, [...path, key]));
  }
  return [];
}

const HAS_CHINESE = /[一-鿿]/;

/** Product names are the same word in every language and must not be "translated". */
const KEEPS_LATIN_TEXT = new Set([
  'language.label',
  'nav.items./admin/marketing-sms',
  'nav.shortItems./admin/marketing-sms',
]);

describe('the Chinese dictionary', () => {
  it('has exactly the keys English has', () => {
    expect(leaves(zhCN).map((leaf) => leaf.path).sort()).toEqual(
      leaves(en).map((leaf) => leaf.path).sort(),
    );
  });

  /**
   * The one a type system cannot catch: a value copied across and
   * never translated still compiles, and reads as a bug to the only
   * person who needed it.
   */
  it('actually contains Chinese, not copied English', () => {
    const untranslated = leaves(zhCN)
      .filter((leaf) => !KEEPS_LATIN_TEXT.has(leaf.path))
      .filter((leaf) => !HAS_CHINESE.test(leaf.value))
      .map((leaf) => `${leaf.path} = ${leaf.value}`);

    expect(untranslated).toEqual([]);
  });

  it('keeps product names untranslated', () => {
    expect(zhCN.analytics.stages.pressedPay).toContain('M-Pesa');
    expect(zhCN.analytics.whatsappFunnel).toContain('WhatsApp');
  });
});

describe('coverage of things that render from a list', () => {
  /** A nav item added later with no key shows in English inside a Chinese menu. */
  it('translates every navigation item', () => {
    const missing = ADMIN_NAV_ITEMS.map((item) => item.href).filter(
      (href) => !(href in en.nav.items),
    );
    expect(missing).toEqual([]);
  });

  it('translates every navigation group', () => {
    const missing = [...new Set(ADMIN_NAV_ITEMS.map((item) => item.group))].filter(
      (group) => !(group in en.nav.groups),
    );
    expect(missing).toEqual([]);
  });

  it('translates every order status', () => {
    const missing = Object.keys(ORDER_STATUS_LABELS).filter(
      (status) => !(status in en.orderStatus),
    );
    expect(missing).toEqual([]);
  });
});

describe('locale resolution', () => {
  it('serves the dictionary asked for', () => {
    expect(getDictionary('zh-CN').nav.items['/admin/orders']).toBe('订单');
    expect(getDictionary('en').nav.items['/admin/orders']).toBe('Orders');
  });

  it('names each language in itself, so the person needing it can read it', () => {
    expect(LOCALE_LABELS['zh-CN']).toBe('简体中文');
  });

  it('refuses anything not on the list, including a tampered cookie', () => {
    expect(isSupportedLocale('zh-CN')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale('')).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
    expect(SUPPORTED_LOCALES).toContain('en');
  });
});

describe('interpolate', () => {
  it('fills a named placeholder', () => {
    expect(interpolate('最近 {days} 天', { days: 30 })).toBe('最近 30 天');
  });

  /** A template outliving its value must show the placeholder, not "undefined". */
  it('leaves an unknown placeholder alone', () => {
    expect(interpolate('{a} and {b}', { a: '1' })).toBe('1 and {b}');
    expect(interpolate('{a}')).toBe('{a}');
  });
});
