import type { Timestamp } from 'firebase/firestore';

/**
 * `machineInventoryMovements/{movementId}` — the immutable ledger
 * behind a machine slot's stock (§ CORE ENTITIES 4, § inventory: "do
 * not make current_quantity the sole source of truth").
 *
 * A separate collection from the existing `inventoryMovements`
 * (`types/inventoryMovement.ts`), not a reuse of it — deliberately.
 * That collection is shaped around `packageId` for the warehouse/box
 * catalogue and has no concept of a machine or a slot; forcing a
 * machine restock through it would mean either bolting
 * `machineId`/`slotId` onto a type that already means something else,
 * or leaving them off and losing the one thing this ledger exists
 * for. Same pattern, same ledger discipline (delta + resulting
 * quantity + reason + actor, immutable, never edited), separate
 * collection because it is a separate physical reality.
 *
 * `MachineSlot.currentQuantity` is a cache of this ledger's running
 * total, kept for a cheap read — this collection is what a
 * reconciliation actually trusts when the two disagree.
 */
export type MachineInventoryMovementReason =
  | 'restock'
  | 'sale'
  | 'manual_adjustment'
  | 'waste'
  | 'return';

export interface MachineInventoryMovement {
  businessId: string;
  machineId: string;
  slotId: string;
  productId: string | null;
  reason: MachineInventoryMovementReason;
  /** Positive = added, negative = removed. */
  quantityDelta: number;
  /** The slot's quantity immediately before this movement — captured at write time, not re-derived later, so the ledger reads as a real sequence even if it is later replayed out of order for reconciliation. */
  beforeQuantity: number;
  afterQuantity: number;
  /** Set only for `reason: 'sale'` — the transaction this movement is the inventory side of. Null for every other reason. */
  sourceTransactionId: string | null;
  note: string | null;
  actor: string;
  createdAt: Timestamp;
}
