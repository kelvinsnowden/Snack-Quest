import { describe, expect, it } from 'vitest';
import { availableCallSlots, isOfferedSlot, CALL_BOOKING_DAYS } from '@/lib/leads/callSlots';

// Friday 16 Oct 2026, 08:00 Nairobi.
const NOW = Date.parse('2026-10-16T08:00:00+03:00');
const at = (iso: string) => Date.parse(iso);

describe('availableCallSlots', () => {
  it('offers weekdays only, 10:00 to 16:30 Nairobi, every 30 minutes', () => {
    const days = availableCallSlots(NOW);
    const friday = days.find((day) => day.date === '2026-10-16')!;
    expect(friday.slots[0]).toBe(at('2026-10-16T11:00:00+03:00')); // 3h notice from 08:00 rules out 10:00 and 10:30
    expect(friday.slots.at(-1)).toBe(at('2026-10-16T16:30:00+03:00'));
    expect(days.some((day) => day.date === '2026-10-17' || day.date === '2026-10-18')).toBe(false); // weekend
    expect(days.find((day) => day.date === '2026-10-19')!.slots).toHaveLength(14);
  });

  it('looks ten working days ahead', () => {
    expect(availableCallSlots(NOW)).toHaveLength(CALL_BOOKING_DAYS);
  });

  it('hides slots already taken', () => {
    const taken = at('2026-10-19T10:00:00+03:00');
    const monday = availableCallSlots(NOW, new Set([taken])).find((day) => day.date === '2026-10-19')!;
    expect(monday.slots).not.toContain(taken);
  });

  it('drops a day whose slots have all passed', () => {
    const lateFriday = Date.parse('2026-10-16T15:00:00+03:00');
    expect(availableCallSlots(lateFriday).some((day) => day.date === '2026-10-16')).toBe(false);
  });
});

describe('isOfferedSlot', () => {
  it('accepts an offered start and rejects off-grid or out-of-hours times', () => {
    expect(isOfferedSlot(at('2026-10-19T10:00:00+03:00'), NOW)).toBe(true);
    expect(isOfferedSlot(at('2026-10-19T10:15:00+03:00'), NOW)).toBe(false);
    expect(isOfferedSlot(at('2026-10-19T19:00:00+03:00'), NOW)).toBe(false);
    expect(isOfferedSlot(at('2026-10-18T11:00:00+03:00'), NOW)).toBe(false);
  });
});
