/**
 * Buckets an already-`createdAt desc`-ordered list into "Today" /
 * "Yesterday" / calendar-date sections (§ Creator Portal premium
 * rebuild, date-grouped history) — the same shape consumer finance
 * apps use for transaction history, so a creator scanning Earnings or
 * Withdrawals sees "what happened recently" instead of a flat ledger.
 * Assumes descending order rather than sorting itself: every caller
 * already gets that ordering for free from its Repository's own
 * `orderBy('createdAt', 'desc')`, so re-sorting here would be wasted
 * work that could also silently mask a caller bug if it ever drifted.
 */

export interface DateGroup<T> {
  label: string;
  items: T[];
}

/**
 * Accepts either a Firestore Timestamp-like object (server) or an ISO
 * string (client — a Timestamp can't cross the Server → Client
 * Component boundary as a prop, so client callers pre-format to a
 * string first) so the same grouping logic runs on both sides.
 */
function toDateSafe(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const timestamp = value as { toDate?: () => Date } | undefined;
  return timestamp?.toDate ? timestamp.toDate() : null;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function labelFor(date: Date | null, now: Date): string {
  if (!date) return 'Unknown date';
  if (isSameCalendarDay(date, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function groupByDateLabel<T>(items: T[], getDate: (item: T) => unknown): DateGroup<T>[] {
  const now = new Date();
  const groups: DateGroup<T>[] = [];

  for (const item of items) {
    const label = labelFor(toDateSafe(getDate(item)), now);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }

  return groups;
}
