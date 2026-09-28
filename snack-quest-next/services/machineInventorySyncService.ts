import { resolveOccurredAt } from '@/lib/vending/machineEvents';
import 'server-only';

import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineEventService } from '@/services/machineEventService';
import { LOW_STOCK_THRESHOLD_FRACTION } from '@/services/machineSlotService';
import { resolveSlotCode } from '@/lib/vending/slotMapping';
import type { MachineEventSource } from '@/types';

export interface SlotQuantityReport {
  manufacturerSlotId: string;
  quantity: number;
}

export interface InventorySyncResult {
  slotsReported: number;
  /** An older report than one already applied (delayed or reordered): recorded, not compared. */
  stale: boolean;
  /** Slots whose stock the ledger changed after this report was taken (a sale, a restock): not compared. */
  supersededSlots: string[];
  mismatches: { slotCode: string; expected: number; reported: number }[];
  unmappedSlots: string[];
  emptySlots: string[];
  lowSlots: string[];
}

/**
 * Inventory synchronization (§ INVENTORY, § "inventory mismatch").
 *
 * A machine's own count is a *report*, never the record: Snack Quest's
 * inventory is the `machineInventoryMovements` ledger, and
 * `MachineSlot.currentQuantity` is its cache. So a sync compares, and
 * records what it found as events — `INVENTORY_MISMATCH` when the
 * machine and the ledger disagree, `SLOT_EMPTY`/`SLOT_LOW` from the
 * machine's own sensors — and never overwrites the ledger. A mismatch
 * reaches staff through the Alert Center, and they correct it through
 * the existing audited stock-adjustment flow, where a human decides
 * which side is right.
 */
class MachineInventorySyncService {
  async sync(input: {
    businessId: string;
    machineId: string;
    reports: SlotQuantityReport[];
    /** The caller's idempotency key for this whole report — a retried report produces no new events. */
    reportId: string;
    source: MachineEventSource;
    deviceTimestamp?: string | null;
  }): Promise<InventorySyncResult> {
    const machine = await machineRepository.findById(input.businessId, input.machineId);
    if (!machine) {
      throw new MachineNotFoundError(input.machineId);
    }
    const slots = await machineSlotRepository.listByMachine(input.businessId, input.machineId);
    const bySlotCode = new Map(slots.map((slot) => [slot.slotCode, slot]));
    const result: InventorySyncResult = { slotsReported: input.reports.length, stale: false, supersededSlots: [], mismatches: [], unmappedSlots: [], emptySlots: [], lowSlots: [] };
    const record = (type: Parameters<typeof machineEventService.record>[0]['type'], key: string, slotCode: string | null, data: Record<string, unknown>) =>
      machineEventService.record(
        {
          businessId: input.businessId,
          machineId: input.machineId,
          type,
          source: input.source,
          dedupeKey: `inventory:${input.reportId}:${key}`,
          deviceTimestamp: input.deviceTimestamp,
          slotCode,
          data,
        },
        machine,
      );

    // When was this count taken? A delayed or reordered report is older
    // than what the ledger already reflects — comparing it would raise a
    // false mismatch (e.g. a pre-restock count arriving after the restock).
    const observedAt = resolveOccurredAt(input.deviceTimestamp, new Date());
    if (!(await machineIntegrationRepository.noteInventoryReport(input.machineId, observedAt))) {
      result.stale = true;
      await record('INVENTORY_REPORTED', 'summary', null, { slotsReported: result.slotsReported, stale: true, observedAt: observedAt.toISOString() });
      return result;
    }

    for (const report of input.reports) {
      const slotCode = resolveSlotCode(slots, report.manufacturerSlotId);
      const slot = slotCode ? bySlotCode.get(slotCode) : undefined;
      if (!slot || !slotCode) {
        result.unmappedSlots.push(report.manufacturerSlotId);
        await record('INVENTORY_MISMATCH', `unmapped:${report.manufacturerSlotId}`, null, {
          reason: 'unmapped_slot',
          manufacturerSlotId: report.manufacturerSlotId,
          reported: report.quantity,
        });
        continue;
      }
      if (slot.stockChangedAt && slot.stockChangedAt.toMillis() > observedAt.getTime()) {
        // The ledger moved this slot after the count was taken: the count can't be compared.
        result.supersededSlots.push(slotCode);
        continue;
      }
      if (report.quantity !== slot.currentQuantity) {
        result.mismatches.push({ slotCode, expected: slot.currentQuantity, reported: report.quantity });
        await record('INVENTORY_MISMATCH', `mismatch:${slotCode}`, slotCode, { reason: 'count_differs', expected: slot.currentQuantity, reported: report.quantity });
      }
      if (report.quantity <= 0) {
        result.emptySlots.push(slotCode);
        await record('SLOT_EMPTY', `empty:${slotCode}`, slotCode, { reported: report.quantity });
      } else if (slot.capacity > 0 && report.quantity <= Math.floor(slot.capacity * LOW_STOCK_THRESHOLD_FRACTION)) {
        result.lowSlots.push(slotCode);
        await record('SLOT_LOW', `low:${slotCode}`, slotCode, { reported: report.quantity, capacity: slot.capacity });
      }
    }

    await record('INVENTORY_REPORTED', 'summary', null, {
      slotsReported: result.slotsReported,
      supersededSlots: result.supersededSlots.length,
      mismatches: result.mismatches.length,
      unmappedSlots: result.unmappedSlots.length,
    });
    await machineIntegrationRepository.recordSignal(input.machineId, 'inventory_sync');
    return result;
  }
}

export const machineInventorySyncService = new MachineInventorySyncService();
export { MachineInventorySyncService };
