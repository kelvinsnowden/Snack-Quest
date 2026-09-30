import 'server-only';

import { createHash } from 'node:crypto';

import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { stockTransferRepository } from '@/repositories/stockTransferRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { machineSlotService } from '@/services/machineSlotService';
import type { MachineInventoryMovement, MachineInventoryMovementReason, MachineSlot } from '@/types';

export class SlotNotFoundError extends Error {
  constructor(machineId: string, slotCode: string) {
    super(`Slot ${slotCode} on machine ${machineId} not found`);
    this.name = 'SlotNotFoundError';
  }
}

export class InsufficientMachineStockError extends Error {
  constructor(machineId: string, slotCode: string, attempted: number, available: number) {
    super(`Cannot remove ${attempted} units from ${machineId}/${slotCode} — only ${available} available`);
    this.name = 'InsufficientMachineStockError';
  }
}

export class LedgerAlignmentRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerAlignmentRefusedError';
  }
}

export class InvalidStockCountError extends Error {
  constructor() {
    super('The count must be a whole number, zero or more.');
    this.name = 'InvalidStockCountError';
  }
}

export class DiscrepancyReasonRequiredError extends Error {
  constructor() {
    super('A reason is required to record a stock discrepancy adjustment');
    this.name = 'DiscrepancyReasonRequiredError';
  }
}

/**
 * The immutable ledger behind every machine slot's stock
 * (§ CORE ENTITIES 4, § "do not make current_quantity the sole
 * source of truth"). Every movement — restock, sale, adjustment,
 * waste, return — goes through `recordMovement`, which writes the
 * ledger entry and updates the slot's cached `currentQuantity` in one
 * Firestore transaction, so the two can never disagree from this
 * service's own writes. `reconcile` is what proves that, and what
 * would catch it if something else ever wrote to `currentQuantity`
 * outside this path.
 */

/** The document id an idempotent movement is stored under — deterministic, so a retry lands on the same document and a trace can find it without a query. */
export function movementDocIdFor(businessId: string, idempotencyKey: string): string {
  return `mv_${createHash('sha256').update(`${businessId}:${idempotencyKey}`).digest('hex').slice(0, 40)}`;
}
class MachineInventoryMovementService {
  async recordMovement(input: {
    businessId: string;
    machineId: string;
    slotId: string;
    reason: MachineInventoryMovementReason;
    quantityDelta: number;
    sourceTransactionId?: string | null;
    restockTaskId?: string | null;
    batchId?: string | null;
    expiresAt?: Date | null;
    note?: string | null;
    actor: string;
    /**
     * Makes the movement idempotent: the same key can move stock at most
     * once, however many times it is retried (a sale uses
     * `sale:{transactionId}`). A repeat returns `{ duplicate: true }`
     * and changes nothing.
     */
    idempotencyKey?: string;
    /**
     * Sets the slot to this quantity instead of applying `quantityDelta`:
     * the delta is worked out inside the transaction from the slot as it
     * is at that moment. A physical count uses this, so two identical
     * counts, or a sale landing between reading and writing, can't apply
     * the same correction twice.
     */
    setQuantityTo?: number;
    /** Extra writes that must land in the same transaction as the movement (the transfer ledger entry for a removal). */
    alsoInTransaction?: (tx: FirebaseFirestore.Transaction, movement: { slot: MachineSlot; beforeQuantity: number; afterQuantity: number; quantityDelta: number }) => void;
  }): Promise<{ afterQuantity: number; beforeQuantity?: number; quantityDelta?: number; duplicate?: boolean }> {
    const movementDocId = input.idempotencyKey ? movementDocIdFor(input.businessId, input.idempotencyKey) : undefined;
    const result = await adminFirestore.runTransaction(async (tx) => {
      if (movementDocId) {
        const existing = await tx.get(machineInventoryMovementRepository.refFor(movementDocId));
        if (existing.exists) {
          return { afterQuantity: (existing.data() as MachineInventoryMovement).afterQuantity, slot: null, duplicate: true };
        }
      }
      const slot = await machineSlotRepository.getInTransaction(tx, input.machineId, input.slotId);
      if (!slot || slot.businessId !== input.businessId) {
        throw new SlotNotFoundError(input.machineId, input.slotId);
      }
      const beforeQuantity = slot.currentQuantity;
      const quantityDelta = input.setQuantityTo === undefined ? input.quantityDelta : input.setQuantityTo - beforeQuantity;
      const afterQuantity = beforeQuantity + quantityDelta;
      if (afterQuantity < 0) {
        throw new InsufficientMachineStockError(input.machineId, input.slotId, -quantityDelta, beforeQuantity);
      }

      machineSlotRepository.updateQuantityInTransaction(tx, input.machineId, input.slotId, afterQuantity);
      machineInventoryMovementRepository.createInTransaction(tx, {
        businessId: input.businessId,
        machineId: input.machineId,
        slotId: input.slotId,
        productId: slot.productId,
        reason: input.reason,
        quantityDelta,
        beforeQuantity,
        afterQuantity,
        sourceTransactionId: input.sourceTransactionId ?? null,
        restockTaskId: input.restockTaskId ?? null,
        batchId: input.batchId ?? null,
        expiresAt: input.expiresAt ? (Timestamp.fromDate(input.expiresAt) as unknown as MachineInventoryMovement['expiresAt']) : null,
        note: input.note ?? null,
        actor: input.actor,
      }, movementDocId);
      input.alsoInTransaction?.(tx, { slot, beforeQuantity, afterQuantity, quantityDelta });

      return { afterQuantity, beforeQuantity, quantityDelta, slot: { ...slot, currentQuantity: afterQuantity } satisfies MachineSlot, duplicate: false };
    });
    if (result.duplicate || !result.slot) {
      return { afterQuantity: result.afterQuantity, duplicate: true };
    }

    // Outside the transaction — a restock-task creation is its own
    // write and does not need to be atomic with the stock movement
    // itself; missing the exact instant a threshold is crossed by a
    // read that happens a moment later is a cosmetic delay, not a
    // correctness problem the way a wrong quantity would be.
    await machineSlotService.checkLowStock(result.slot, input.actor);

    return { afterQuantity: result.afterQuantity, beforeQuantity: result.beforeQuantity, quantityDelta: result.quantityDelta };
  }

  /**
   * Recomputes what `currentQuantity` *should* be from the ledger and
   * compares it against the slot's cached value
   * (§ TESTING: "stock reconciliation"). Reports a mismatch; does not
   * silently correct one — a disagreement here means something wrote
   * to the slot outside this service, which is worth investigating,
   * not papering over.
   */
  async reconcile(businessId: string, machineId: string, slotCode: string): Promise<{ cached: number; ledgerDerived: number; matches: boolean }> {
    const slot = await machineSlotRepository.findBySlotCode(businessId, machineId, slotCode);
    if (!slot) {
      throw new SlotNotFoundError(machineId, slotCode);
    }
    const ledgerDerived = await machineInventoryMovementRepository.sumDeltasForSlot(businessId, machineId, slotCode);
    return { cached: slot.currentQuantity, ledgerDerived, matches: slot.currentQuantity === ledgerDerived };
  }

  /** `reconcile` for every slot on one machine, in slot order. */
  async reconcileMachine(businessId: string, machineId: string): Promise<{ slotCode: string; productId: string | null; cached: number; ledgerDerived: number; matches: boolean }[]> {
    const slots = await machineSlotRepository.listByMachine(businessId, machineId);
    const rows = await Promise.all(
      slots.map(async (slot) => {
        const ledgerDerived = await machineInventoryMovementRepository.sumDeltasForSlot(businessId, machineId, slot.slotCode);
        return { slotCode: slot.slotCode, productId: slot.productId, cached: slot.currentQuantity, ledgerDerived, matches: slot.currentQuantity === ledgerDerived };
      }),
    );
    return rows.sort((a, b) => a.slotCode.localeCompare(b.slotCode, undefined, { numeric: true }));
  }

  /**
   * Puts a slot's cached count back in line with its ledger, after
   * `reconcile` shows they disagree (something wrote the count outside
   * `recordMovement`). The ledger is the record, so the count moves to
   * it; no movement is written, because no stock moved. Read and write
   * happen in one transaction, so a sale landing at the same moment
   * can't be overwritten. Needs a reason; the caller audits it. If the
   * shelf itself differs, a physical count
   * (`recordDiscrepancyAdjustment`) comes after.
   */
  async alignSlotToLedger(input: { businessId: string; machineId: string; slotCode: string; reason: string }): Promise<{ before: number; after: number; changed: boolean }> {
    if (!input.reason.trim()) {
      throw new LedgerAlignmentRefusedError('Say why the count is being corrected.');
    }
    return adminFirestore.runTransaction(async (tx) => {
      const slot = await machineSlotRepository.getInTransaction(tx, input.machineId, input.slotCode);
      if (!slot || slot.businessId !== input.businessId) {
        throw new SlotNotFoundError(input.machineId, input.slotCode);
      }
      const ledgerDerived = await machineInventoryMovementRepository.sumDeltasForSlotInTransaction(tx, input.businessId, input.machineId, input.slotCode);
      if (ledgerDerived < 0) {
        throw new LedgerAlignmentRefusedError(`The ledger for slot ${input.slotCode} adds up to ${ledgerDerived}, below zero — it needs investigating, not copying onto the slot.`);
      }
      if (ledgerDerived === slot.currentQuantity) {
        return { before: slot.currentQuantity, after: ledgerDerived, changed: false };
      }
      machineSlotRepository.updateQuantityInTransaction(tx, input.machineId, input.slotCode, ledgerDerived);
      return { before: slot.currentQuantity, after: ledgerDerived, changed: true };
    });
  }

  /**
   * Takes stock out of a machine for a stated reason (§ TYPED STOCK REMOVAL):
   * expired or damaged stock goes to waste, returned stock goes back to the
   * warehouse. The slot movement and the transfer-ledger entry are one
   * transaction, carrying who owned the stock and its cost at that moment.
   */
  async removeStock(input: {
    businessId: string;
    machineId: string;
    slotId: string;
    quantity: number;
    reason: 'expired' | 'damaged' | 'returned';
    note: string;
    actor: string;
    /** Cost basis and ownership, resolved by the caller before the transaction. */
    ownership: { owner: 'snack_quest' | 'machine_owner'; partnerId: string | null; unitCostBasisKes: number | null };
  }): Promise<{ afterQuantity: number }> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new InvalidStockCountError();
    }
    if (!input.note.trim()) {
      throw new DiscrepancyReasonRequiredError();
    }
    const to = input.reason === 'returned' ? { kind: 'warehouse' as const, id: null } : { kind: input.reason === 'expired' ? ('waste' as const) : ('damaged' as const), id: null };
    const { afterQuantity } = await this.recordMovement({
      businessId: input.businessId,
      machineId: input.machineId,
      slotId: input.slotId,
      reason: input.reason === 'returned' ? 'return' : 'waste',
      quantityDelta: -input.quantity,
      note: `${input.reason}: ${input.note.trim()}`,
      actor: input.actor,
      alsoInTransaction: (tx, movement) => {
        stockTransferRepository.createInTransaction(tx, {
          businessId: input.businessId,
          productCatalogue: movement.slot.productCatalogue,
          productId: movement.slot.productId,
          quantity: input.quantity,
          from: { kind: 'machine', id: input.machineId, slotId: input.slotId },
          to,
          ownership: input.ownership.owner,
          ownerPartnerId: input.ownership.partnerId,
          unitCostBasisKes: input.ownership.unitCostBasisKes,
          reason: input.reason === 'expired' ? 'removed_expired' : input.reason === 'damaged' ? 'removed_damaged' : 'returned_to_warehouse',
          restockTaskId: null,
          machineId: input.machineId,
          ownerWholesaleSaleId: null,
          note: input.note.trim(),
          actor: input.actor,
        });
      },
    });
    return { afterQuantity };
  }

  /**
   * § STOCK DISCREPANCY: "expected quantity vs physical count, require
   * a reason, create an inventory adjustment ledger entry" — the one
   * writer of `reason: 'manual_adjustment'` in this codebase. The
   * expected quantity is the slot's own cached `currentQuantity` at
   * the moment of the count, never re-derived from the ledger here
   * (that comparison is what `reconcile` is for, a different
   * question: "did this service's own bookkeeping stay consistent",
   * not "does the physical shelf match what we think is on it"). A
   * count that matches exactly still writes a zero-delta movement —
   * a real, useful fact ("we checked, it was correct") rather than a
   * silent no-op that leaves no trace a count ever happened.
   */
  async recordDiscrepancyAdjustment(input: {
    businessId: string;
    machineId: string;
    slotId: string;
    physicalCountQuantity: number;
    reason: string;
    actor: string;
  }): Promise<{ expectedQuantity: number; physicalCountQuantity: number; discrepancy: number; afterQuantity: number }> {
    if (!input.reason.trim()) {
      throw new DiscrepancyReasonRequiredError();
    }
    if (!Number.isInteger(input.physicalCountQuantity) || input.physicalCountQuantity < 0) {
      throw new InvalidStockCountError();
    }
    // The expected quantity and the correction are read and written in
    // one transaction (setQuantityTo), never computed from an earlier read.
    const { afterQuantity, beforeQuantity, quantityDelta } = await this.recordMovement({
      businessId: input.businessId,
      machineId: input.machineId,
      slotId: input.slotId,
      reason: 'manual_adjustment',
      quantityDelta: 0,
      setQuantityTo: input.physicalCountQuantity,
      note: input.reason,
      actor: input.actor,
    });
    const expectedQuantity = beforeQuantity ?? afterQuantity;
    const discrepancy = quantityDelta ?? 0;

    return { expectedQuantity, physicalCountQuantity: input.physicalCountQuantity, discrepancy, afterQuantity };
  }
}

export const machineInventoryMovementService = new MachineInventoryMovementService();
