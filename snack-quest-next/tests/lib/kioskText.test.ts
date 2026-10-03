import { describe, expect, it } from 'vitest';
import { KIOSK_DICTIONARIES, kioskText } from '@/lib/kiosk/kioskText';
import { KIOSK_LOCALES } from '@/types/kioskExperience';

const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('kiosk text', () => {
  it('every language has every phrase, with the same placeholders as English', () => {
    const english = KIOSK_DICTIONARIES.en;
    for (const locale of KIOSK_LOCALES) {
      const dictionary = KIOSK_DICTIONARIES[locale];
      expect(Object.keys(dictionary).sort(), locale).toEqual(Object.keys(english).sort());
      for (const key of Object.keys(english) as (keyof typeof english)[]) {
        expect(dictionary[key].trim().length, `${locale}.${key}`).toBeGreaterThan(0);
        expect(slots(dictionary[key]), `${locale}.${key}`).toEqual(slots(english[key]));
      }
    }
  });

  it('fills placeholders, counts, splits around markup slots and words allergens', () => {
    const sw = kioskText('sw');
    expect(sw.t('fromOrigin', { origin: 'Japan' })).toBe('Kutoka Japan');
    expect(sw.count('itemCount', 1)).toBe('Kitu 1');
    expect(kioskText('en').count('itemCount', 3)).toBe('3 items');
    expect(kioskText('en').parts('enterPinPrompt')).toEqual([{ text: 'Enter your M-Pesa PIN on ' }, { slot: 'phone' }, { text: ' to pay ' }, { slot: 'amount' }, { text: ' for your whole order.' }]);
    expect(sw.allergens(['milk', 'peanuts'])).toBe('Ina maziwa, karanga.');
    expect(sw.allergens([])).toBe('Hakuna vizio vilivyotajwa.');
    expect(sw.allergens(null)).toBeNull();
  });
});
