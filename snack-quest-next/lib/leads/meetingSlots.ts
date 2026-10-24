/**
 * When a lead can book the meeting where they place a machine order
 * (§ order meetings) — the `/meet` link in the founding-orders email.
 * Unlike the WhatsApp call, this runs between fixed dates rather than a
 * rolling window: the offer is for orders placed in November.
 *
 * Nairobi has no daylight saving, so a fixed +03:00 offset is exact all year.
 */
export const MEETING_MINUTES = 60;
/** Weekdays only (1 = Monday … 5 = Friday). */
export const MEETING_DAYS = [1, 2, 3, 4, 5];
/** Meeting start times, Nairobi time. */
export const MEETING_TIMES = ['10:00', '12:00', '14:00', '16:00'];
/** The first and last days a meeting can be booked, Nairobi time. */
export const MEETING_FIRST_DATE = '2026-11-01';
export const MEETING_LAST_DATE = '2026-11-30';
/**
 * Days already taken outside this page, set by hand. They show as booked,
 * the same as a day someone booked here.
 */
export const MEETING_BLOCKED_DATES: readonly string[] = ['2026-11-03', '2026-11-05'];
/** No meeting sooner than this, so there is time to confirm the place. */
export const MEETING_MIN_NOTICE_MS = 24 * 60 * 60 * 1000;

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export interface MeetingDay {
  /** `yyyy-mm-dd` in Nairobi. */
  date: string;
  /** Open start times (epoch ms); empty when the day is booked. */
  slots: number[];
  /** The day's meeting is taken. There is one meeting a day at most. */
  booked: boolean;
}

/** The Nairobi calendar date (`yyyy-mm-dd`) of an instant. */
export function nairobiDate(ms: number): string {
  return new Date(ms + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Every meeting day between the first and last dates, from today on.
 * A day in `bookedDates`, or blocked by hand, comes back booked with no
 * times. Any other day comes back with the start times (epoch ms) still
 * far enough ahead, and is left out when none are.
 */
export function availableMeetingSlots(nowMs: number, bookedDates: ReadonlySet<string> = new Set()): MeetingDay[] {
  const days: MeetingDay[] = [];
  // Midnight starting the first date and midnight after the last one, Nairobi time, in UTC ms.
  const first = Date.parse(`${MEETING_FIRST_DATE}T00:00:00+03:00`);
  const end = Date.parse(`${MEETING_LAST_DATE}T00:00:00+03:00`) + DAY_MS;
  // Midnight today, Nairobi time, in UTC ms.
  const today = Math.floor((nowMs + NAIROBI_OFFSET_MS) / DAY_MS) * DAY_MS - NAIROBI_OFFSET_MS;
  for (let dayStart = Math.max(today, first); dayStart < end; dayStart += DAY_MS) {
    const weekday = new Date(dayStart + NAIROBI_OFFSET_MS).getUTCDay();
    if (!MEETING_DAYS.includes(weekday)) continue;
    const date = nairobiDate(dayStart);
    if (bookedDates.has(date) || MEETING_BLOCKED_DATES.includes(date)) {
      days.push({ date, slots: [], booked: true });
      continue;
    }
    const slots = MEETING_TIMES.map((time) => dayStart + minutesOf(time) * 60 * 1000).filter(
      (at) => at - nowMs >= MEETING_MIN_NOTICE_MS,
    );
    if (slots.length > 0) days.push({ date, slots, booked: false });
  }
  return days;
}

/**
 * True when `atMs` is a start this schedule would offer now — the server
 * re-checks every booking with this. Whether someone already has that
 * day is checked when the booking is written.
 */
export function isOfferedMeetingSlot(atMs: number, nowMs: number): boolean {
  return availableMeetingSlots(nowMs).some((day) => day.slots.includes(atMs));
}
