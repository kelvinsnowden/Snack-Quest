/**
 * When a lead can book the meeting where they place a machine order
 * (§ order meetings) — the `/meet` link in the founding-orders email.
 * Unlike the WhatsApp call, this runs to a fixed date rather than a
 * rolling window: the offer is for orders placed by the end of November.
 *
 * Nairobi has no daylight saving, so a fixed +03:00 offset is exact all year.
 */
export const MEETING_MINUTES = 60;
/** Monday to Saturday (1 = Monday … 6 = Saturday). */
export const MEETING_DAYS = [1, 2, 3, 4, 5, 6];
/** Meeting start times, Nairobi time. */
export const MEETING_TIMES = ['10:00', '12:00', '14:00', '16:00'];
/** The last day a meeting can be booked, Nairobi time. */
export const MEETING_LAST_DATE = '2026-11-30';
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
  slots: number[];
}

/** Every bookable meeting start (epoch ms) up to the last date, grouped by Nairobi day, minus the ones taken. */
export function availableMeetingSlots(nowMs: number, takenMs: ReadonlySet<number> = new Set()): MeetingDay[] {
  const days: MeetingDay[] = [];
  // Midnight after the last date, Nairobi time, in UTC ms.
  const end = Date.parse(`${MEETING_LAST_DATE}T00:00:00+03:00`) + DAY_MS;
  // Midnight today, Nairobi time, in UTC ms.
  for (let dayStart = Math.floor((nowMs + NAIROBI_OFFSET_MS) / DAY_MS) * DAY_MS - NAIROBI_OFFSET_MS; dayStart < end; dayStart += DAY_MS) {
    const weekday = new Date(dayStart + NAIROBI_OFFSET_MS).getUTCDay();
    if (!MEETING_DAYS.includes(weekday)) continue;
    const slots = MEETING_TIMES.map((time) => dayStart + minutesOf(time) * 60 * 1000).filter(
      (at) => at - nowMs >= MEETING_MIN_NOTICE_MS && !takenMs.has(at),
    );
    if (slots.length > 0) days.push({ date: new Date(dayStart + NAIROBI_OFFSET_MS).toISOString().slice(0, 10), slots });
  }
  return days;
}

/** True when `atMs` is a start this schedule would offer now — the server re-checks every booking with this. */
export function isOfferedMeetingSlot(atMs: number, nowMs: number): boolean {
  return availableMeetingSlots(nowMs).some((day) => day.slots.includes(atMs));
}
