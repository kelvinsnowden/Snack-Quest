import { describe, expect, it } from 'vitest';
import { addReading, closeHour, temperatureLogDocId } from '@/lib/vending/temperatureLog';

const H = Date.parse('2026-10-17T09:00:00Z');
const MIN = 60_000;

describe('temperature record accumulation', () => {
  it('builds an hour from readings at most once a minute, and closes it when the next hour starts', () => {
    let step = addReading(null, 5, H + MIN);
    expect(step.changed).toBe(true);
    step = addReading(step.hour, 9, H + MIN + 10_000); // too soon: not counted
    expect(step.changed).toBe(false);
    step = addReading(step.hour, 7, H + 3 * MIN);
    step = addReading(step.hour, 3, H + 5 * MIN);
    expect(step.hour).toMatchObject({ minCelsius: 3, maxCelsius: 7, samples: 3 });
    const next = addReading(step.hour, 6, H + 61 * MIN);
    expect(next.finished).toEqual({ hourStartMs: H, minCelsius: 3, maxCelsius: 7, avgCelsius: 5, samples: 3 });
    expect(next.hour).toMatchObject({ hourStartMs: H + 60 * MIN, samples: 1 });
  });

  it('ignores missing and unplugged-probe readings, and late readings for a closed hour', () => {
    const hour = addReading(null, 5, H + MIN).hour;
    expect(addReading(hour, null, H + 10 * MIN).changed).toBe(false);
    expect(addReading(hour, -50, H + 10 * MIN).changed).toBe(false);
    expect(addReading(hour, 5, H - 10 * MIN).changed).toBe(false);
  });

  it('averages to one decimal and names rows so one machine sorts together', () => {
    expect(closeHour({ hourStartMs: H, minCelsius: 4, maxCelsius: 5, sumCelsius: 13.4, samples: 3, lastSampleAtMs: H }).avgCelsius).toBe(4.5);
    expect(temperatureLogDocId('m1', H)).toBe('m1_2026101709');
  });
});
