import type { Machine } from '@/types';

/**
 * What an owner may see of a machine's past. A machine that changed
 * hands carries `ownerSince`; nothing before it belongs to the current
 * owner, so the owner portal hides it. Absent or null means the owner
 * has held it since registration and sees everything.
 */
export function ownerSince(machine: Pick<Machine, 'ownerSince'>): Date | null {
  const value = machine.ownerSince as unknown as
    { toDate(): Date } | null | undefined;
  return value ? value.toDate() : null;
}

/**
 * The first whole UTC day (the key daily rollups use) that belongs
 * entirely to the current owner. The handover day itself mixes both
 * owners' sales, so it's left out rather than shown to the new owner.
 */
export function firstOwnedDayKey(since: Date | null): string | null {
  if (!since) return null;
  const midnight = new Date(
    Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()),
  );
  if (midnight.getTime() < since.getTime())
    midnight.setUTCDate(midnight.getUTCDate() + 1);
  return midnight.toISOString().slice(0, 10);
}

/** A rollup range start moved forward to the owner's first whole day. */
export function clipStartDate(startDate: string, since: Date | null): string {
  const first = firstOwnedDayKey(since);
  return first && first > startDate ? first : startDate;
}

/** True when a moment belongs to the current owner's time with the machine. */
export function withinTenure(
  at: { toMillis(): number } | Date | null | undefined,
  since: Date | null,
): boolean {
  if (!since) return true;
  if (!at) return false;
  const millis = at instanceof Date ? at.getTime() : at.toMillis();
  return millis >= since.getTime();
}
