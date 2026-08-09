import { describe, expect, it } from 'vitest';
import {
  DELIVERY_DAYS_FROM_NAIROBI,
  JUMIA_ZONES,
  SMALL_PACKAGE_FEE_FROM_NAIROBI_KES,
  feeForZoneKes,
  isJumiaZone,
  resolveZoneForLocality,
} from '@/lib/delivery/jumiaZones';

/**
 * Jumia's real rate card (§ pickup delivery pricing). These are the
 * figures a customer is actually charged, so the transcription is
 * asserted outright — a typo here is a mispriced order on every
 * delivery to that zone.
 *
 * The behaviour that matters most is what happens to a town Jumia
 * hasn't published: it must resolve to null, and stay null, because a
 * guessed zone means charging the wrong amount for real.
 */

describe('Nairobi-origin small-package rates', () => {
  it('matches the published card exactly', () => {
    expect(SMALL_PACKAGE_FEE_FROM_NAIROBI_KES).toEqual({
      'Zone 1': 160,
      'Zone 2': 200,
      'Zone 3': 250,
      'Zone 4': 300,
      'Zone 5': 400,
      'Zone 6': 450,
    });
  });

  it('prices every zone — no zone can be silently unpriced', () => {
    for (const zone of JUMIA_ZONES) {
      expect(feeForZoneKes(zone)).toBeGreaterThan(0);
      expect(DELIVERY_DAYS_FROM_NAIROBI[zone]).toBeGreaterThan(0);
    }
  });

  it('gets more expensive the further out the zone goes', () => {
    const fees = JUMIA_ZONES.map(feeForZoneKes);
    expect(fees).toEqual([...fees].sort((a, b) => a - b));
  });
});

describe('resolveZoneForLocality', () => {
  it('places the whole of Nairobi county in Zone 1', () => {
    expect(resolveZoneForLocality('Kangemi', 'Nairobi')).toBe('Zone 1');
    expect(resolveZoneForLocality('Nairobi CBD', 'Nairobi')).toBe('Zone 1');
    // A Nairobi station whose town we never classified is still Nairobi.
    expect(resolveZoneForLocality(null, 'Nairobi')).toBe('Zone 1');
  });

  it('reads the published localities, however they are written', () => {
    expect(resolveZoneForLocality('Thika', 'Kiambu')).toBe('Zone 2');
    expect(resolveZoneForLocality('nakuru', 'Nakuru')).toBe('Zone 3');
    expect(resolveZoneForLocality("Murang'a", "Murang'a")).toBe('Zone 3');
    expect(resolveZoneForLocality('Kakamega', 'Kakamega')).toBe('Zone 4');
    expect(resolveZoneForLocality('Wajir', 'Wajir')).toBe('Zone 6');
  });

  it('sees through our own disambiguating suffixes', () => {
    expect(resolveZoneForLocality('Majengo (Kisumu)', 'Kisumu')).toBe(null);
    expect(resolveZoneForLocality('Kisumu (Central)', 'Kisumu')).toBe('Zone 3');
  });

  it('returns null for a town Jumia has not published, rather than guessing', () => {
    // Every one of these is a real station town in this network that
    // the published zone list simply does not name.
    for (const [town, county] of [
      ['Mombasa', 'Mombasa'],
      ['Nyali', 'Mombasa'],
      ['Malindi', 'Kilifi'],
      ['Kitui', 'Kitui'],
      ['Ruiru', 'Kiambu'],
      ['Voi', 'Taita-Taveta'],
    ] as const) {
      expect(resolveZoneForLocality(town, county)).toBeNull();
    }
  });

  it('does not fall back to the county when the county has a listed neighbour', () => {
    // Kiambu county spans Zone 2 (Kiambu, Kikuyu, Thika) and Zone 5
    // (Gatundu), so "somewhere in Kiambu" is not enough to price by.
    expect(resolveZoneForLocality('Githunguri', 'Kiambu')).toBeNull();
    expect(resolveZoneForLocality('Gatundu', 'Kiambu')).toBe('Zone 5');
    expect(resolveZoneForLocality('Kikuyu', 'Kiambu')).toBe('Zone 2');
  });

  it('returns null for nothing at all', () => {
    expect(resolveZoneForLocality(null, null)).toBeNull();
    expect(resolveZoneForLocality('', '')).toBeNull();
  });
});

describe('isJumiaZone', () => {
  it('accepts only the six real zones', () => {
    expect(isJumiaZone('Zone 1')).toBe(true);
    expect(isJumiaZone('Zone 6')).toBe(true);
    // A county name is what an unzoned station still carries — it must
    // never read as priced.
    expect(isJumiaZone('Mombasa')).toBe(false);
    expect(isJumiaZone('Zone 7')).toBe(false);
    expect(isJumiaZone(null)).toBe(false);
    expect(isJumiaZone('')).toBe(false);
  });
});
