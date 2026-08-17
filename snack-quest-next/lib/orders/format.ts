/** Shared display formatting for anything that renders an `Order` — kept out of any one page so the list and detail views never drift. */

export function formatKes(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE')}`;
}

/** The human-friendly reference for `Order.orderNumber` — what a customer or staff member actually says/types, never the raw Firestore document id. */
export function formatOrderNumber(orderNumber: number): string {
  return `SQ-${orderNumber}`;
}

export function formatDate(value: unknown): string {
  const timestamp = value as { toDate?: () => Date } | undefined;
  const date = timestamp?.toDate ? timestamp.toDate() : null;
  if (!date) return '—';
  return date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** ISO string for a Firestore Timestamp — the shape a Client Component date needs, since a Timestamp itself can't cross that boundary as a prop. Empty string when unset, never a guessed date. */
export function toIsoString(value: unknown): string {
  const timestamp = value as { toDate?: () => Date } | undefined;
  const date = timestamp?.toDate ? timestamp.toDate() : null;
  return date ? date.toISOString() : '';
}

export function formatDateTime(value: unknown): string {
  const timestamp = value as { toDate?: () => Date } | undefined;
  const date = timestamp?.toDate ? timestamp.toDate() : null;
  if (!date) return '—';
  return date.toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
