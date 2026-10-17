import { describe, expect, it } from 'vitest';
import {
  CoolingValidationError,
  DEFAULT_COOLING,
  TEMPERATURE_SILENCE_MS,
  breachIsAlertable,
  effectiveCooling,
  judgeTemperature,
  nextBreachSince,
  parseCooling,
} from '@/lib/vending/cooling';

const NOW = Date.parse('2026-10-17T10:00:00Z');
const reading = (celsius: number | null, agoMs = 0) => ({ celsius, atMs: NOW - agoMs });

describe('parseCooling', () => {
  it('accepts a sensible range and rounds to one decimal', () => {
    expect(parseCooling({ enabled: true, minCelsius: 2.04, maxCelsius: '7.96', alertAfterMinutes: 20 })).toEqual({ enabled: true, minCelsius: 2, maxCelsius: 8, alertAfterMinutes: 20 });
  });

  it('refuses ranges a thermostat could not hold or that make no sense', () => {
    expect(() => parseCooling({ enabled: true, minCelsius: 5, maxCelsius: 6, alertAfterMinutes: 30 })).toThrow(CoolingValidationError);
    expect(() => parseCooling({ enabled: true, minCelsius: -40, maxCelsius: 5, alertAfterMinutes: 30 })).toThrow(CoolingValidationError);
    expect(() => parseCooling({ enabled: true, minCelsius: 3, maxCelsius: 8, alertAfterMinutes: 1 })).toThrow(CoolingValidationError);
    expect(() => parseCooling({ minCelsius: 3, maxCelsius: 8, alertAfterMinutes: 30 })).toThrow(CoolingValidationError);
  });
});

describe('judgeTemperature', () => {
  it('judges a fresh reading against the range', () => {
    expect(judgeTemperature(DEFAULT_COOLING, reading(5), NOW).kind).toBe('in_range');
    expect(judgeTemperature(DEFAULT_COOLING, reading(11), NOW).kind).toBe('too_warm');
    expect(judgeTemperature(DEFAULT_COOLING, reading(1), NOW).kind).toBe('too_cold');
  });

  it('treats an unplugged probe, a missing value or an old reading as no reading', () => {
    expect(judgeTemperature(DEFAULT_COOLING, reading(-50), NOW).kind).toBe('no_reading');
    expect(judgeTemperature(DEFAULT_COOLING, reading(null), NOW).kind).toBe('no_reading');
    expect(judgeTemperature(DEFAULT_COOLING, reading(5, TEMPERATURE_SILENCE_MS + 1), NOW).kind).toBe('no_reading');
    expect(judgeTemperature(DEFAULT_COOLING, null, NOW).kind).toBe('no_reading');
  });

  it('does not monitor an ambient machine', () => {
    expect(judgeTemperature({ ...DEFAULT_COOLING, enabled: false }, reading(30), NOW).kind).toBe('not_monitored');
    expect(judgeTemperature(null, reading(30), NOW).kind).toBe('not_monitored');
  });
});

describe('out-of-range spells', () => {
  it('starts, keeps and clears the spell, and alerts only once it has lasted', () => {
    const warm = judgeTemperature(DEFAULT_COOLING, reading(12), NOW);
    const started = nextBreachSince(null, warm, NOW);
    expect(started).toBe(NOW);
    expect(nextBreachSince(started, warm, NOW + 60_000)).toBe(NOW);
    expect(nextBreachSince(started, { kind: 'no_reading', lastReadingAtMs: null }, NOW + 60_000)).toBe(NOW);
    expect(nextBreachSince(started, judgeTemperature(DEFAULT_COOLING, reading(5), NOW), NOW)).toBeNull();
    expect(breachIsAlertable(DEFAULT_COOLING, started, NOW + 29 * 60_000)).toBe(false);
    expect(breachIsAlertable(DEFAULT_COOLING, started, NOW + 30 * 60_000)).toBe(true);
  });
});

describe('effectiveCooling', () => {
  it('uses the saved range, else the default only once a real temperature has been reported', () => {
    const saved = { enabled: true, minCelsius: 0, maxCelsius: 4, alertAfterMinutes: 15 };
    expect(effectiveCooling(saved, null)).toBe(saved);
    expect(effectiveCooling(null, 6)).toEqual(DEFAULT_COOLING);
    expect(effectiveCooling(null, null)).toBeNull();
    expect(effectiveCooling(null, -50)).toBeNull();
  });
});
