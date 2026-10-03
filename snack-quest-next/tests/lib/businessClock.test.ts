import { describe, expect, it } from 'vitest';
import { businessHourAndWeekday } from '@/lib/vending/businessClock';

/**
 * Peak hours and peak days are read on Nairobi's clock. The cases that
 * matter are the ones where UTC and Nairobi disagree about the hour and
 * about the day.
 */
describe('businessHourAndWeekday', () => {
  it('reads the Nairobi hour, three hours ahead of UTC', () => {
    expect(businessHourAndWeekday(new Date('2026-09-29T09:15:00Z'))).toEqual({ hour: 12, weekday: 2 });
  });

  it('rolls over to the next Nairobi day late in the UTC evening', () => {
    // 21:30 UTC on Saturday is 00:30 on Sunday in Nairobi.
    expect(businessHourAndWeekday(new Date('2026-10-03T21:30:00Z'))).toEqual({ hour: 0, weekday: 0 });
  });

  it('reports midnight as hour 0, never 24', () => {
    expect(businessHourAndWeekday(new Date('2026-09-28T21:00:00Z')).hour).toBe(0);
  });
});
