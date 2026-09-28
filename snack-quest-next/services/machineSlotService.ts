import { slotMappingHistoryRepository } from '@/repositories/slotMappingHistoryRepository';
import 'server-only';

import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { defaultVendingAdapterResolver, type VendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import { findSlotMappingConflicts } from '@/lib/vending/slotMapping';
import type { MachineSlot } from '@/types';

export class SlotMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlotMappingError';
  }
}

/** Below this fraction of capacity, a slot is considered low stock (§ RESTOCKING SYSTEM). Not yet a per-business setting — see `machineService`'s own connectivity-threshold precedent for the pattern a future one would follow. */
export const LOW_STOCK_THRESHOLD_FRACTION = 0.2;

/**
 * Slot configuration and low-stock detection (§ CORE ENTITIES 2,
 * § RESTOCKING SYSTEM). Price/enable/disable calls the hardware
 * adapter *and* writes Firestore — never one without the other, so a
 * slot's recorded price always matches what the machine will actually
 * charge (once a real adapter enforces pricing on-device at all;
 * `MockVendingAdapter` does, a manufacturer's own hardware may not,
 * which is exactly the kind of assumption this abstraction exists to
 * isolate rather than bake into every caller).
 */
class MachineSlotService {
  constructor(private readonly resolveAdapter: VendingAdapterResolver = defaultVendingAdapterResolver) {}

  async configureSlot(input: {
    businessId: string;
    machineId: string;
    slotCode: string;
    productId: string | null;
    productCatalogue: MachineSlot['productCatalogue'];
    priceKes: number;
    capacity: number;
    position: number;
  }): Promise<void> {
    const machine = await machineRepository.findById(input.businessId, input.machineId);
    if (!machine) {
      throw new MachineNotFoundError(input.machineId);
    }
    validateSlotConfiguration(input);
    const existing = await machineSlotRepository.findBySlotCode(input.businessId, input.machineId, input.slotCode);
    await machineSlotRepository.upsert({
      businessId: input.businessId,
      machineId: input.machineId,
      slotCode: input.slotCode,
      productId: input.productId,
      productCatalogue: input.productCatalogue,
      priceKes: input.priceKes,
      capacity: input.capacity,
      currentQuantity: existing?.currentQuantity ?? 0,
      enabled: existing?.enabled ?? true,
      position: input.position,
    });
    const adapter = this.resolveAdapter(machine.manufacturer);
    await adapter.setPrice(input.machineId, input.slotCode, input.priceKes);
  }

  /**
   * Sets which manufacturer slot name each Snack Quest slot answers to
   * (§ PRODUCT / SLOT MAPPING). Validated as a whole before anything is
   * written: every slot must exist on this machine, and after applying
   * the change no two slots may claim the same manufacturer name —
   * otherwise translating their `spiral_07` back to our code would be
   * ambiguous, and a dispense could go to the wrong spiral.
   */
  async setSlotMappings(
    businessId: string,
    machineId: string,
    mappings: { slotCode: string; manufacturerSlotId: string | null }[],
    actor = 'system',
  ): Promise<MachineSlot[]> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }
    const slots = await machineSlotRepository.listByMachine(businessId, machineId);
    const bySlotCode = new Map(slots.map((slot) => [slot.slotCode, slot]));
    for (const mapping of mappings) {
      if (!bySlotCode.has(mapping.slotCode)) {
        throw new SlotMappingError(`Slot ${mapping.slotCode} is not configured on this machine`);
      }
      if (mapping.manufacturerSlotId !== null && !/^[A-Za-z0-9_.:-]{1,64}$/.test(mapping.manufacturerSlotId)) {
        throw new SlotMappingError(`"${mapping.manufacturerSlotId}" is not a valid manufacturer slot id (letters, digits, _ . : - ; max 64)`);
      }
    }
    const next = slots.map((slot) => {
      const change = mappings.find((mapping) => mapping.slotCode === slot.slotCode);
      return change ? { ...slot, manufacturerSlotId: change.manufacturerSlotId } : slot;
    });
    const conflicts = findSlotMappingConflicts(next);
    if (conflicts.length > 0) {
      throw new SlotMappingError(conflicts.join('; '));
    }
    await machineSlotRepository.setManufacturerSlotIds(machineId, mappings);
    // History is appended after the change is applied; only real changes are recorded.
    await slotMappingHistoryRepository.append(
      mappings
        .map((mapping) => ({ mapping, from: bySlotCode.get(mapping.slotCode)?.manufacturerSlotId ?? null }))
        .filter(({ mapping, from }) => from !== mapping.manufacturerSlotId)
        .map(({ mapping, from }) => ({ businessId, machineId, slotCode: mapping.slotCode, from, to: mapping.manufacturerSlotId, changedBy: actor })),
    );
    return machineSlotRepository.listByMachine(businessId, machineId);
  }

  async setPrice(businessId: string, machineId: string, slotCode: string, priceKes: number): Promise<void> {
    if (!Number.isInteger(priceKes) || priceKes < 0 || priceKes > MAX_PRICE_KES) {
      throw new SlotMappingError(`priceKes must be a whole number of shillings between 0 and ${MAX_PRICE_KES}`);
    }
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }
    await machineSlotRepository.updatePrice(businessId, machineId, slotCode, priceKes);
    const adapter = this.resolveAdapter(machine.manufacturer);
    await adapter.setPrice(machineId, slotCode, priceKes);
  }

  async setEnabled(businessId: string, machineId: string, slotCode: string, enabled: boolean): Promise<void> {
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }
    await machineSlotRepository.setEnabled(businessId, machineId, slotCode, enabled);
    const adapter = this.resolveAdapter(machine.manufacturer);
    if (enabled) {
      await adapter.enableSlot(machineId, slotCode);
    } else {
      await adapter.disableSlot(machineId, slotCode);
    }
  }

  async listByMachine(businessId: string, machineId: string): Promise<MachineSlot[]> {
    return machineSlotRepository.listByMachine(businessId, machineId);
  }

  /**
   * Opens a restock task if this slot has fallen below
   * `LOW_STOCK_THRESHOLD_FRACTION` of capacity and does not already
   * have one open — called after every sale movement
   * (`machineInventoryMovementService.recordMovement`), not on a
   * schedule, so the task appears the moment the threshold is
   * crossed rather than up to a polling interval later.
   */
  async checkLowStock(slot: MachineSlot, actor: string): Promise<{ opened: boolean }> {
    if (slot.capacity <= 0 || slot.currentQuantity / slot.capacity > LOW_STOCK_THRESHOLD_FRACTION) {
      return { opened: false };
    }
    const open = await restockTaskRepository.listOpenByMachine(slot.businessId, slot.machineId);
    const alreadyQueued = open.some((task) => task.data.items.some((item) => item.slotId === slot.slotCode));
    if (alreadyQueued) {
      return { opened: false };
    }
    await restockTaskRepository.create({
      businessId: slot.businessId,
      machineId: slot.machineId,
      warehouseId: null,
      items: [
        {
          slotId: slot.slotCode,
          productId: slot.productId,
          quantityNeeded: slot.capacity - slot.currentQuantity,
          quantityDispatched: null,
          quantityReceived: null,
          discrepancyQuantity: null,
          batchId: null,
          expiresAt: null,
        },
      ],
      status: 'draft',
      priority: slot.currentQuantity === 0 ? 'high' : 'normal',
      discrepancyNote: null,
      note: `auto: slot ${slot.slotCode} at ${slot.currentQuantity}/${slot.capacity}`,
      createdBy: actor,
    });
    return { opened: true };
  }
}

export const machineSlotService = new MachineSlotService();
export { MachineSlotService };

const MAX_PRICE_KES = 100_000;
const MAX_SLOT_CAPACITY = 1_000;

/**
 * A slot's configuration must be internally consistent before it can
 * be sold from: a whole, non-negative price (and a positive one when a
 * product is assigned — a free sale is not a configuration mistake we
 * want to discover at the till), a product catalogue whenever there is
 * a product, and a sane capacity and position.
 */
function validateSlotConfiguration(input: { slotCode: string; productId: string | null; productCatalogue: MachineSlot['productCatalogue']; priceKes: number; capacity: number; position: number }): void {
  const problems: string[] = [];
  if (!/^[A-Za-z0-9_-]{1,16}$/.test(input.slotCode)) problems.push('slotCode must be 1–16 letters, digits, _ or -');
  if (!Number.isInteger(input.priceKes) || input.priceKes < 0 || input.priceKes > MAX_PRICE_KES) problems.push(`priceKes must be a whole number between 0 and ${MAX_PRICE_KES}`);
  if (input.productId !== null && input.priceKes <= 0) problems.push('a slot with a product must have a price above 0');
  if (input.productId !== null && !input.productCatalogue) problems.push('productCatalogue is required when a product is assigned');
  if (input.productId !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(input.productId)) problems.push('productId is not a valid id');
  if (!Number.isInteger(input.capacity) || input.capacity < 0 || input.capacity > MAX_SLOT_CAPACITY) problems.push(`capacity must be a whole number between 0 and ${MAX_SLOT_CAPACITY}`);
  if (!Number.isInteger(input.position) || input.position < 0) problems.push('position must be a whole number ≥ 0');
  if (problems.length > 0) {
    throw new SlotMappingError(`Invalid slot configuration for ${input.slotCode}: ${problems.join('; ')}`);
  }
}
