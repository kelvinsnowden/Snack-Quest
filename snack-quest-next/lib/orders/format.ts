/** Shared display formatting for anything that renders an `Order` — kept out of any one page so the list and detail views never drift. */

export function formatKes(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE')}`;
}

export function formatDate(value: unknown): string {
  const timestamp = value as { toDate?: () => Date } | undefined;
  const date = timestamp?.toDate ? timestamp.toDate() : null;
  if (!date) return '—';
  return date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
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
