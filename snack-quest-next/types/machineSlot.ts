import type { Timestamp } from 'firebase/firestore';

/**
 * `machineSlots/{machineId}__{slotCode}` — one physical dispensing
 * slot on a machine (§ CORE ENTITIES 2, docs/FLEET_ARCHITECTURE_AUDIT.md
 * §7).
 *
 * `productId` references the *existing* catalogue
 * (`packages`/`snackItems`) — deliberately not a second product
 * table. The same product can sit in a slot on machine A, a different
 * slot on machine B, the online box catalogue, and a store shelf, each
 * at its own price; this collection is where "which slot, on which
 * machine, at what price" lives, not what the product itself is.
 *
 * `currentQuantity` is a cache of the ledger in
 * `machineInventoryMovements`, not the source of truth — see that
 * type's own doc comment. A read may show this stale by the time a
 * client acts on it; `machineInventoryMovementService.reconcile()` is
 * what re-derives it from the ledger when the two disagree.
 */
export interface MachineSlot {
  businessId: string;
  machineId: string;
  slotCode: string;
  /** References `packages/{packageId}` or `snackItems/{snackItemId}` — whichever this business's catalogue uses for what this slot dispenses. Null for an empty, unassigned slot. */
  productId: string | null;
  productCatalogue: 'package' | 'snackItem' | null;
  priceKes: number;
  capacity: number;
  currentQuantity: number;
  enabled: boolean;
  /** Physical/display ordering on the machine's own panel — never used for anything financial. */
  position: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export function machineSlotDocId(machineId: string, slotCode: string): string {
  return `${machineId}__${slotCode}`;
}
