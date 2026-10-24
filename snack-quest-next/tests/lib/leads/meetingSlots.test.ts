import { describe, expect, it } from 'vitest';
import {
  availableMeetingSlots,
  isOfferedMeetingSlot,
  MEETING_BLOCKED_DATES,
  MEETING_FIRST_DATE,
  MEETING_LAST_DATE,
  nairobiDate,
} from '@/lib/leads/meetingSlots';

// Friday 23 Oct 2026, 09:00 Nairobi — before the meetings open.
const NOW = Date.parse('2026-10-23T09:00:00+03:00');
const at = (iso: string) => Date.parse(iso);
const open = (days: ReturnType<typeof availableMeetingSlots>) => days.filter((day) => !day.booked);

describe('availableMeetingSlots', () => {
  it('opens on the first date: nothing in October, Sunday 1 November skipped, Monday 2 November first', () => {
    const days = availableMeetingSlots(NOW);
    expect(MEETING_FIRST_DATE).toBe('2026-11-01');
    expect(days.some((day) => day.date < MEETING_FIRST_DATE)).toBe(false);
    expect(days[0]).toMatchObject({ date: '2026-11-02', booked: false });
  });

  it('offers weekdays only, at 10:00, 12:00, 14:00 and 16:00 Nairobi', () => {
    const days = availableMeetingSlots(NOW);
    expect(days.find((day) => day.date === '2026-11-02')!.slots).toEqual([
      at('2026-11-02T10:00:00+03:00'),
      at('2026-11-02T12:00:00+03:00'),
      at('2026-11-02T14:00:00+03:00'),
      at('2026-11-02T16:00:00+03:00'),
    ]);
    expect(days.some((day) => day.date === '2026-11-07' || day.date === '2026-11-08')).toBe(false); // weekend
  });

  it('shows the hand-blocked days in the first week as booked, with no times', () => {
    expect(MEETING_BLOCKED_DATES).toEqual(['2026-11-03', '2026-11-05']);
    const days = availableMeetingSlots(NOW);
    for (const date of MEETING_BLOCKED_DATES) {
      expect(days.find((day) => day.date === date)).toEqual({ date, slots: [], booked: true });
    }
  });

  it('shows a day someone booked as booked, with no times', () => {
    const days = availableMeetingSlots(NOW, new Set(['2026-11-04']));
    expect(days.find((day) => day.date === '2026-11-04')).toEqual({ date: '2026-11-04', slots: [], booked: true });
    expect(days.find((day) => day.date === '2026-11-06')?.booked).toBe(false);
  });

  it('needs a day’s notice', () => {
    // Wednesday 11 Nov, 09:00: nothing that day, and Thursday 10:00 is just over 24 hours away.
    const wednesday = at('2026-11-11T09:00:00+03:00');
    const days = open(availableMeetingSlots(wednesday));
    expect(days.some((day) => day.date === '2026-11-11')).toBe(false);
    expect(days[0].slots[0]).toBe(at('2026-11-12T10:00:00+03:00'));
    // Wednesday 11:00: Thursday 10:00 is now under 24 hours away, so Thursday starts at 12:00.
    expect(open(availableMeetingSlots(at('2026-11-11T11:00:00+03:00')))[0].slots[0]).toBe(at('2026-11-12T12:00:00+03:00'));
  });

  it('runs to the last date and no further', () => {
    const days = availableMeetingSlots(NOW);
    expect(days.at(-1)!.date).toBe(MEETING_LAST_DATE);
    expect(availableMeetingSlots(at('2026-12-01T08:00:00+03:00'))).toEqual([]);
  });
});

describe('isOfferedMeetingSlot', () => {
  it('accepts an offered start and rejects anything else', () => {
    expect(isOfferedMeetingSlot(at('2026-11-02T14:00:00+03:00'), NOW)).toBe(true);
    expect(isOfferedMeetingSlot(at('2026-11-02T15:00:00+03:00'), NOW)).toBe(false); // off the grid
    expect(isOfferedMeetingSlot(at('2026-11-03T10:00:00+03:00'), NOW)).toBe(false); // blocked by hand
    expect(isOfferedMeetingSlot(at('2026-10-30T10:00:00+03:00'), NOW)).toBe(false); // a weekday before the first date
    expect(isOfferedMeetingSlot(at('2026-11-07T10:00:00+03:00'), NOW)).toBe(false); // Saturday
    expect(isOfferedMeetingSlot(at('2026-11-08T10:00:00+03:00'), NOW)).toBe(false); // Sunday
    expect(isOfferedMeetingSlot(at('2026-12-01T10:00:00+03:00'), NOW)).toBe(false); // after the last date
  });
});

describe('nairobiDate', () => {
  it('reads the date in Nairobi, not UTC', () => {
    expect(nairobiDate(at('2026-11-02T00:30:00+03:00'))).toBe('2026-11-02'); // still 1 November in UTC
    expect(nairobiDate(at('2026-11-02T23:30:00+03:00'))).toBe('2026-11-02');
  });
});
