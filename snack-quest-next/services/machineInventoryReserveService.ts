import 'server-only';

import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';

/** The platform default when a machine's own agreement hasn't negotiated a different baseline (§ KSh 100,000 MACHINE STOCK BASELINE). */
export const DEFAULT_RESERVE_TARGET_KES = 100_000;

export interface MachineReserveStatus {
  targetKes: number;
  currentAtCostKes: number;
  currentAtRetailKes: number;
  /** `currentAtCostKes - targetKes` — negative means under the reserve. */
  varianceKes: number;
  /** `max(0, -varianceKes)` — how much restocking (at cost) would bring this machine back to its reserve. */
  replenishmentRequiredKes: number;
  /** Slots whose product has no known unit cost (a `package`, which carries no cost field today — see docs/INVENTORY_ARCHITECTURE.md §4) — counted, never silently treated as free or ignored. */
  unpricedSlotCount: number;
}

/**
 * The KSh 100,000 reserve, computed from data that already exists —
 * no new ledger (§ KSh 100,000 MACHINE STOCK BASELINE,
 * docs/INVENTORY_ARCHITECTURE.md §4). Reads `MachineSlot.currentQuantity`
 * (itself a cache of `MachineInventoryMovement`, already the ledger's
 * own source of truth) rather than re-deriving from the raw movement
 * stream — the same "read the cache, trust the ledger to keep it
 * correct" discipline every other slot-quantity read in this codebase
 * already holds.
 */
class MachineInventoryReserveService {
  async getReserveStatus(businessId: string, machineId: string): Promise<MachineReserveStatus> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }

    const slots = await machineSlotRepository.listByMachine(businessId, machineId);
    const snackItemSlots = slots.filter((slot) => slot.productCatalogue === 'snackItem' && slot.productId);
    const snackItemsById = await snackItemRepository.findManyById(snackItemSlots.map((slot) => slot.productId!));

    let currentAtCostKes = 0;
    let currentAtRetailKes = 0;
    let unpricedSlotCount = 0;

    for (const slot of slots) {
      currentAtRetailKes += slot.currentQuantity * slot.priceKes;
      if (slot.productCatalogue === 'snackItem' && slot.productId) {
        const item = snackItemsById.get(slot.productId);
        if (item) {
          currentAtCostKes += slot.currentQuantity * item.expectedUnitCostKes;
          continue;
        }
      }
      // 'package' slots (no cost field today), or an unresolvable
      // productId — counted as unpriced, never silently zero-cost.
      if (slot.currentQuantity > 0) {
        unpricedSlotCount += 1;
      }
    }

    const targetKes = machine.inventoryReserveTargetKes ?? DEFAULT_RESERVE_TARGET_KES;
    const varianceKes = currentAtCostKes - targetKes;

    return {
      targetKes,
      currentAtCostKes,
      currentAtRetailKes,
      varianceKes,
      replenishmentRequiredKes: Math.max(0, -varianceKes),
      unpricedSlotCount,
    };
  }
}

export const machineInventoryReserveService = new MachineInventoryReserveService();
