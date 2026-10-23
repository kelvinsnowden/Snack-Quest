import { describe, expect, it } from 'vitest';
import { availableMeetingSlots, isOfferedMeetingSlot, MEETING_LAST_DATE } from '@/lib/leads/meetingSlots';

// Friday 23 Oct 2026, 09:00 Nairobi.
const NOW = Date.parse('2026-10-23T09:00:00+03:00');
const at = (iso: string) => Date.parse(iso);

describe('availableMeetingSlots', () => {
  it('offers weekdays only, at 10:00, 12:00, 14:00 and 16:00 Nairobi', () => {
    const days = availableMeetingSlots(NOW);
    const monday = days.find((day) => day.date === '2026-10-26')!;
    expect(monday.slots).toEqual([
      at('2026-10-26T10:00:00+03:00'),
      at('2026-10-26T12:00:00+03:00'),
      at('2026-10-26T14:00:00+03:00'),
      at('2026-10-26T16:00:00+03:00'),
    ]);
    expect(days.some((day) => day.date === '2026-10-24' || day.date === '2026-10-25')).toBe(false); // weekend
  });

  it('needs a day’s notice', () => {
    // Thursday 09:00: nothing today, and Friday 10:00 is just over 24 hours away.
    const thursday = at('2026-10-22T09:00:00+03:00');
    const days = availableMeetingSlots(thursday);
    expect(days.some((day) => day.date === '2026-10-22')).toBe(false);
    expect(days[0].slots[0]).toBe(at('2026-10-23T10:00:00+03:00'));
    // Thursday 11:00: Friday 10:00 is now under 24 hours away, so Friday starts at 12:00.
    expect(availableMeetingSlots(at('2026-10-22T11:00:00+03:00'))[0].slots[0]).toBe(at('2026-10-23T12:00:00+03:00'));
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
    expect(isOfferedMeetingSlot(at('2026-10-31T10:00:00+03:00'), NOW)).toBe(false); // Saturday
    expect(isOfferedMeetingSlot(at('2026-11-01T10:00:00+03:00'), NOW)).toBe(false); // Sunday
    expect(isOfferedMeetingSlot(at('2026-12-01T10:00:00+03:00'), NOW)).toBe(false); // after the last date
  });
});
