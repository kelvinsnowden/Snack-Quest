export type BatchExpiryStatus = 'none' | 'expired' | 'soon' | 'ok';

/** Not a component/hook — safe to call `Date.now()` here (§ Admin: Inventory batches/expiring-soon). */
export function classifyBatchExpiry(expiresAt: unknown, withinDays: number): BatchExpiryStatus {
  const timestamp = expiresAt as { toDate?: () => Date } | null;
  const date = timestamp?.toDate ? timestamp.toDate() : null;
  if (!date) return 'none';
  const now = Date.now();
  const cutoff = now + withinDays * 24 * 60 * 60 * 1000;
  const time = date.getTime();
  if (time < now) return 'expired';
  if (time <= cutoff) return 'soon';
  return 'ok';
}
