import type { MachineSlot } from '@/types';

/**
 * Translation between Snack Quest slot codes and a manufacturer's own
 * slot names (§ PRODUCT / SLOT MAPPING) — `spiral_01` on one vendor,
 * `A1` on another, both `A01` inside Snack Quest.
 *
 * Applied only at the integration boundary: outbound (a dispense
 * command tells the machine its own slot name) and inbound (a v1 API
 * report or a webhook naming a manufacturer slot). Everything inside —
 * transactions, inventory, analytics — speaks `slotCode` only.
 *
 * A slot with no explicit mapping uses its Snack Quest code on both
 * sides, which is exactly right for manufacturers who adopt our naming.
 */
export function manufacturerSlotIdFor(slot: Pick<MachineSlot, 'slotCode' | 'manufacturerSlotId'>): string {
  return slot.manufacturerSlotId || slot.slotCode;
}

/** The Snack Quest slot code a manufacturer slot name refers to on this machine — `null` if nothing maps to it. Never guesses. */
export function resolveSlotCode(
  slots: readonly Pick<MachineSlot, 'slotCode' | 'manufacturerSlotId'>[],
  manufacturerSlotId: string,
): string | null {
  const explicit = slots.find((slot) => slot.manufacturerSlotId === manufacturerSlotId);
  if (explicit) {
    return explicit.slotCode;
  }
  // Identity fallback only for slots that have *no* explicit mapping —
  // otherwise an unmapped vendor name that happens to equal another
  // slot's Snack Quest code would silently resolve to the wrong slot.
  const identity = slots.find((slot) => !slot.manufacturerSlotId && slot.slotCode === manufacturerSlotId);
  return identity ? identity.slotCode : null;
}

/** Mapping problems that would make translation ambiguous — surfaced to the admin before they bite. */
export function findSlotMappingConflicts(slots: readonly Pick<MachineSlot, 'slotCode' | 'manufacturerSlotId'>[]): string[] {
  const seen = new Map<string, string>();
  const conflicts: string[] = [];
  for (const slot of slots) {
    const external = manufacturerSlotIdFor(slot);
    const previous = seen.get(external);
    if (previous) {
      conflicts.push(`Manufacturer slot "${external}" maps to both ${previous} and ${slot.slotCode}`);
    } else {
      seen.set(external, slot.slotCode);
    }
  }
  return conflicts;
}
