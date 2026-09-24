import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
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
  }): Promise<{ afterQuantity: number }> {
    const result = await adminFirestore.runTransaction(async (tx) => {
      const slot = await machineSlotRepository.getInTransaction(tx, input.machineId, input.slotId);
      if (!slot || slot.businessId !== input.businessId) {
        throw new SlotNotFoundError(input.machineId, input.slotId);
      }
      const beforeQuantity = slot.currentQuantity;
      const afterQuantity = beforeQuantity + input.quantityDelta;
      if (afterQuantity < 0) {
        throw new InsufficientMachineStockError(input.machineId, input.slotId, -input.quantityDelta, beforeQuantity);
      }

      machineSlotRepository.updateQuantityInTransaction(tx, input.machineId, input.slotId, afterQuantity);
      machineInventoryMovementRepository.createInTransaction(tx, {
        businessId: input.businessId,
        machineId: input.machineId,
        slotId: input.slotId,
        productId: slot.productId,
        reason: input.reason,
        quantityDelta: input.quantityDelta,
        beforeQuantity,
        afterQuantity,
        sourceTransactionId: input.sourceTransactionId ?? null,
        restockTaskId: input.restockTaskId ?? null,
        batchId: input.batchId ?? null,
        expiresAt: input.expiresAt ? (Timestamp.fromDate(input.expiresAt) as unknown as MachineInventoryMovement['expiresAt']) : null,
        note: input.note ?? null,
        actor: input.actor,
      });

      return { afterQuantity, slot: { ...slot, currentQuantity: afterQuantity } satisfies MachineSlot };
    });

    // Outside the transaction — a restock-task creation is its own
    // write and does not need to be atomic with the stock movement
    // itself; missing the exact instant a threshold is crossed by a
    // read that happens a moment later is a cosmetic delay, not a
    // correctness problem the way a wrong quantity would be.
    await machineSlotService.checkLowStock(result.slot, input.actor);

    return { afterQuantity: result.afterQuantity };
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
    const slot = await machineSlotRepository.findBySlotCode(input.businessId, input.machineId, input.slotId);
    if (!slot) {
      throw new SlotNotFoundError(input.machineId, input.slotId);
    }
    const expectedQuantity = slot.currentQuantity;
    const discrepancy = input.physicalCountQuantity - expectedQuantity;

    const { afterQuantity } = await this.recordMovement({
      businessId: input.businessId,
      machineId: input.machineId,
      slotId: input.slotId,
      reason: 'manual_adjustment',
      quantityDelta: discrepancy,
      note: input.reason,
      actor: input.actor,
    });

    return { expectedQuantity, physicalCountQuantity: input.physicalCountQuantity, discrepancy, afterQuantity };
  }
}

export const machineInventoryMovementService = new MachineInventoryMovementService();
