import { describe, expect, it } from 'vitest';
import { availableMeetingSlots, isOfferedMeetingSlot, MEETING_LAST_DATE } from '@/lib/leads/meetingSlots';

// Friday 23 Oct 2026, 09:00 Nairobi.
const NOW = Date.parse('2026-10-23T09:00:00+03:00');
const at = (iso: string) => Date.parse(iso);

describe('availableMeetingSlots', () => {
  it('offers Monday to Saturday at 10:00, 12:00, 14:00 and 16:00 Nairobi', () => {
    const days = availableMeetingSlots(NOW);
    const saturday = days.find((day) => day.date === '2026-10-24')!;
    expect(saturday.slots).toEqual([
      at('2026-10-24T10:00:00+03:00'),
      at('2026-10-24T12:00:00+03:00'),
      at('2026-10-24T14:00:00+03:00'),
      at('2026-10-24T16:00:00+03:00'),
    ]);
    expect(days.some((day) => day.date === '2026-10-25')).toBe(false); // Sunday
  });

  it('needs a day’s notice', () => {
    const days = availableMeetingSlots(NOW);
    expect(days.some((day) => day.date === '2026-10-23')).toBe(false); // today
    // Tomorrow 10:00 is more than 24h away from 09:00 today.
    expect(days[0].slots[0]).toBe(at('2026-10-24T10:00:00+03:00'));
  });

  it('runs to the last date and no further', () => {
    const days = availableMeetingSlots(NOW);
    expect(days.at(-1)!.date).toBe(MEETING_LAST_DATE);
    expect(availableMeetingSlots(at('2026-12-01T08:00:00+03:00'))).toEqual([]);
  });

  it('hides times already taken, and drops a day with none left', () => {
    const monday = ['10:00', '12:00', '14:00', '16:00'].map((time) => at(`2026-10-26T${time}:00+03:00`));
    const days = availableMeetingSlots(NOW, new Set([monday[0]]));
    expect(days.find((day) => day.date === '2026-10-26')!.slots).not.toContain(monday[0]);
    expect(availableMeetingSlots(NOW, new Set(monday)).some((day) => day.date === '2026-10-26')).toBe(false);
  });
});

describe('isOfferedMeetingSlot', () => {
  it('accepts an offered start and rejects anything else', () => {
    expect(isOfferedMeetingSlot(at('2026-11-02T14:00:00+03:00'), NOW)).toBe(true);
    expect(isOfferedMeetingSlot(at('2026-11-02T15:00:00+03:00'), NOW)).toBe(false); // off the grid
    expect(isOfferedMeetingSlot(at('2026-11-01T10:00:00+03:00'), NOW)).toBe(false); // Sunday
    expect(isOfferedMeetingSlot(at('2026-12-01T10:00:00+03:00'), NOW)).toBe(false); // after the last date
  });
});
