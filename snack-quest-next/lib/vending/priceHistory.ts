import type { MachineAssortmentPriceHistoryEntry, MachineSlotPriceHistoryEntry } from '@/types';

/** One line of a product's price story on one machine: either its slot price or the machine's override changed. */
export interface PriceHistoryLine {
  kind: 'slot' | 'override';
  /** The slot, for a slot price change. */
  slotCode: string | null;
  fromKes: number | null;
  /** For an override, null means the override was removed and the slot price applies again. */
  toKes: number | null;
  changedBy: string;
  at: string | null;
}

/** Merges the two price records, newest first. */
export function mergePriceHistory(slotChanges: MachineSlotPriceHistoryEntry[], overrideChanges: MachineAssortmentPriceHistoryEntry[]): PriceHistoryLine[] {
  const iso = (value: { toDate(): Date } | null | undefined) => (value ? value.toDate().toISOString() : null);
  const lines: PriceHistoryLine[] = [
    ...slotChanges.map((entry) => ({ kind: 'slot' as const, slotCode: entry.slotCode, fromKes: entry.fromKes, toKes: entry.toKes, changedBy: entry.changedBy, at: iso(entry.createdAt) })),
    ...overrideChanges.map((entry) => ({ kind: 'override' as const, slotCode: null, fromKes: entry.previousPriceOverrideKes, toKes: entry.newPriceOverrideKes, changedBy: entry.actor, at: iso(entry.createdAt) })),
  ];
  return lines.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}
