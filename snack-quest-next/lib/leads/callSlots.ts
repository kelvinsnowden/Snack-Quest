/**
 * When a lead can book a WhatsApp call (§ lead nurture). Nairobi has no
 * daylight saving, so a fixed +03:00 offset is exact all year.
 */
export const CALL_SLOT_MINUTES = 30;
/** Weekdays (1 = Monday … 5 = Friday), first and last slot start in Nairobi time. */
export const CALL_DAYS = [1, 2, 3, 4, 5];
export const CALL_FIRST_SLOT = '10:00';
export const CALL_LAST_SLOT = '16:30';
/** How many working days ahead a lead can book. */
export const CALL_BOOKING_DAYS = 10;
/** No booking closer than this to now, so someone can prepare. */
export const CALL_MIN_NOTICE_MS = 3 * 60 * 60 * 1000;

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export interface CallDay {
  /** `yyyy-mm-dd` in Nairobi. */
  date: string;
  slots: number[];
}

/** Every bookable slot start (epoch ms), grouped by Nairobi day, minus the ones already taken. */
export function availableCallSlots(nowMs: number, takenMs: ReadonlySet<number> = new Set()): CallDay[] {
  const days: CallDay[] = [];
  // Midnight today, Nairobi time, expressed in UTC ms.
  let dayStart = Math.floor((nowMs + NAIROBI_OFFSET_MS) / DAY_MS) * DAY_MS - NAIROBI_OFFSET_MS;
  const first = minutesOf(CALL_FIRST_SLOT);
  const last = minutesOf(CALL_LAST_SLOT);
  for (let guard = 0; days.length < CALL_BOOKING_DAYS && guard < 31; guard += 1, dayStart += DAY_MS) {
    const weekday = new Date(dayStart + NAIROBI_OFFSET_MS).getUTCDay();
    if (!CALL_DAYS.includes(weekday)) continue;
    const slots: number[] = [];
    for (let minute = first; minute <= last; minute += CALL_SLOT_MINUTES) {
      const at = dayStart + minute * 60 * 1000;
      if (at - nowMs >= CALL_MIN_NOTICE_MS && !takenMs.has(at)) slots.push(at);
    }
    const date = new Date(dayStart + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
    // Today counts toward the ten days even when every slot has passed, so the window doesn't drift.
    days.push({ date, slots });
  }
  return days.filter((day) => day.slots.length > 0);
}

/** True when `atMs` is a slot this schedule would ever offer — the server re-checks every booking with this. */
export function isOfferedSlot(atMs: number, nowMs: number): boolean {
  return availableCallSlots(nowMs).some((day) => day.slots.includes(atMs));
}

export function formatCallTime(atMs: number): string {
  return new Date(atMs).toLocaleString('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}
