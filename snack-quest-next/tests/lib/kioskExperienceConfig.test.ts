import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KIOSK_EXPERIENCE,
  KioskConfigValidationError,
  checkKioskExperience,
  contrastRatio,
  kioskThemeStyle,
  mergeKioskExperience,
  parseKioskPatch,
  stableHash,
} from '@/lib/kiosk/experienceConfig';

/** The kiosk experience rules (§ KIOSK EXPERIENCE BUILDER), shared by the builder and the server. */

describe('parseKioskPatch', () => {
  it('accepts a well-formed layer and drops unknown keys', () => {
    const patch = parseKioskPatch({ theme: { colors: { primary: '#123ABC' }, radius: 'round' }, idle: { timeoutSeconds: 90 }, somethingElse: 1 });
    expect(patch).toEqual({ theme: { colors: { primary: '#123abc' }, radius: 'round' }, idle: { timeoutSeconds: 90 } });
  });

  it('refuses anything that is not a plain #rrggbb colour — no CSS can be smuggled in', () => {
    for (const value of ['red', 'url(javascript:alert(1))', '#fff', 'var(--x)', '#12345g', '#000000;background:url(x)']) {
      expect(() => parseKioskPatch({ theme: { colors: { primary: value } } })).toThrow(KioskConfigValidationError);
    }
  });

  it('lists every problem at once', () => {
    try {
      parseKioskPatch({ idle: { timeoutSeconds: 5 }, theme: { font: 'comic-sans' }, copy: { bannerHeadline: 'x'.repeat(200) } });
      expect.unreachable();
    } catch (error) {
      expect((error as KioskConfigValidationError).problems).toHaveLength(3);
    }
  });

  it('checks sections: known types, unique ids, a message for a message strip', () => {
    expect(() => parseKioskPatch({ browseSections: [{ id: 'a', type: 'marquee', props: {} }] })).toThrow(/type/);
    expect(() =>
      parseKioskPatch({
        browseSections: [
          { id: 'a', type: 'product_grid', props: {} },
          { id: 'a', type: 'category_bar', props: {} },
        ],
      }),
    ).toThrow(/share the id/);
    expect(() => parseKioskPatch({ browseSections: [{ id: 'm', type: 'promo_message', props: {} }] })).toThrow(/message/);
  });
});

describe('mergeKioskExperience', () => {
  it('most specific wins, key by key', () => {
    const merged = mergeKioskExperience(DEFAULT_KIOSK_EXPERIENCE, { theme: { colors: { primary: '#111111' } } }, { theme: { colors: { secondary: '#222222' } }, idle: { timeoutSeconds: 30 } });
    expect(merged.theme.colors.primary).toBe('#111111');
    expect(merged.theme.colors.secondary).toBe('#222222');
    expect(merged.theme.colors.background).toBe(DEFAULT_KIOSK_EXPERIENCE.theme.colors.background);
    expect(merged.idle).toEqual({ timeoutSeconds: 30, adsEnabled: true });
  });

  it('a section list replaces the inherited one whole', () => {
    const merged = mergeKioskExperience(DEFAULT_KIOSK_EXPERIENCE, { browseSections: [{ id: 'g', type: 'product_grid', visible: true, props: { columns: 3 } }] });
    expect(merged.browseSections).toHaveLength(1);
  });

  it('never mutates the defaults', () => {
    const before = JSON.stringify(DEFAULT_KIOSK_EXPERIENCE);
    mergeKioskExperience(DEFAULT_KIOSK_EXPERIENCE, { theme: { colors: { primary: '#000000' } }, browseSections: [] });
    expect(JSON.stringify(DEFAULT_KIOSK_EXPERIENCE)).toBe(before);
  });
});

describe('checkKioskExperience', () => {
  it('the defaults publish, with honest warnings about the brand orange', () => {
    const check = checkKioskExperience(DEFAULT_KIOSK_EXPERIENCE);
    expect(check.errors).toEqual([]);
    expect(check.warnings.join(' ')).toMatch(/Text on main buttons is \d/);
    // The label already names its ground — not “Text on main buttons on main buttons”.
    expect(check.warnings.join(' ')).not.toMatch(/on main buttons on/);
  });

  it('a menu without the product grid can’t publish', () => {
    const config = mergeKioskExperience(DEFAULT_KIOSK_EXPERIENCE, { browseSections: [{ id: 'b', type: 'menu_banner', visible: true, props: {} }] });
    expect(checkKioskExperience(config).errors.join(' ')).toMatch(/All snacks/);
  });

  it('a hidden product grid can’t publish either', () => {
    const config = mergeKioskExperience(DEFAULT_KIOSK_EXPERIENCE, { browseSections: [{ id: 'g', type: 'product_grid', visible: false, props: {} }] });
    expect(checkKioskExperience(config).errors.length).toBeGreaterThan(0);
  });

  it('unreadable body text blocks publishing', () => {
    const config = mergeKioskExperience(DEFAULT_KIOSK_EXPERIENCE, { theme: { colors: { foreground: '#eeeeee' } } });
    expect(checkKioskExperience(config).errors.join(' ')).toMatch(/Main text/);
  });
});

describe('helpers', () => {
  it('contrast ratio matches WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#ff7a00', '#ffffff')).toBeCloseTo(2.6, 1);
  });

  it('the hash is stable and sensitive', () => {
    expect(stableHash('abc')).toBe(stableHash('abc'));
    expect(stableHash('abc')).not.toBe(stableHash('abd'));
  });

  it('the theme becomes custom properties only — never arbitrary CSS', () => {
    const style = kioskThemeStyle(mergeKioskExperience(DEFAULT_KIOSK_EXPERIENCE, { theme: { font: 'system', radius: 'square' } }));
    expect(Object.keys(style).every((key) => key.startsWith('--sq-'))).toBe(true);
    expect(style['--sq-font-display']).toBe('system-ui');
    expect(style['--sq-radius-lg']).toBe('6px');
  });
});

describe('screen languages', () => {
  it('starts English-only, refuses unknown languages and an English "translation", and keeps the start language among those offered', async () => {
    const { DEFAULT_KIOSK_EXPERIENCE: base, parseKioskPatch: parse, KioskConfigValidationError: InvalidConfig } = await import('@/lib/kiosk/experienceConfig');
    expect(base.language).toEqual({ available: ['en'], default: 'en' });
    expect(parse({ language: { available: ['sw', 'en'], default: 'sw' } })).toEqual({ language: { available: ['en', 'sw'], default: 'sw' } });
    expect(() => parse({ language: { available: ['fr'] } })).toThrow(InvalidConfig);
    expect(() => parse({ language: { available: ['en'], default: 'sw' } })).toThrow(InvalidConfig);
    expect(() => parse({ translations: { en: { copy: { bannerHeadline: 'x' } } } })).toThrow(InvalidConfig);
    expect(() => parse({ translations: { sw: { copy: { bannerHeadline: 'x'.repeat(41) } } } })).toThrow(InvalidConfig);
  });

  it('merges translations per field across layers and shows Swahili where translated, English elsewhere', async () => {
    const { DEFAULT_KIOSK_EXPERIENCE: base, mergeKioskExperience: merge, localizeExperience, checkKioskExperience: check } = await import('@/lib/kiosk/experienceConfig');
    const config = merge(
      base,
      { language: { available: ['en', 'sw'] }, translations: { sw: { copy: { bannerHeadline: 'Ladha ya dunia' } } }, browseSections: [...base.browseSections, { id: 'promo', type: 'promo_message', visible: true, props: { text: 'Two for 300', tone: 'highlight' } }] },
      { translations: { sw: { copy: { attractCallToAction: 'Gusa uanze' }, sections: { promo: { text: 'Mbili kwa 300' } } } } },
    );
    const sw = localizeExperience(config, 'sw');
    expect(sw.copy.bannerHeadline).toBe('Ladha ya dunia');
    expect(sw.copy.attractCallToAction).toBe('Gusa uanze');
    expect(sw.copy.bannerEyebrow).toBe(base.copy.bannerEyebrow);
    expect(sw.browseSections.find((section) => section.id === 'promo')?.props.text).toBe('Mbili kwa 300');
    expect(localizeExperience(config, 'en')).toBe(config);

    const result = check(config);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((warning) => warning.startsWith('Kiswahili: '))).toBe(true);
  });

  it('blocks publishing a start language that isn’t offered', async () => {
    const { DEFAULT_KIOSK_EXPERIENCE: base, mergeKioskExperience: merge, checkKioskExperience: check } = await import('@/lib/kiosk/experienceConfig');
    const config = merge(base, { language: { available: ['sw'] } });
    expect(check(config).errors.some((error) => /starting language/.test(error))).toBe(true);
  });
});
