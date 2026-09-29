import { slotMappingHistoryRepository } from '@/repositories/slotMappingHistoryRepository';
import 'server-only';

import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { defaultVendingAdapterResolver, type VendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import { findSlotMappingConflicts } from '@/lib/vending/slotMapping';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import type { DispenseResultStatus } from '@/lib/vending/hardwareAdapter';
import type { MachineSlot, SlotQuarantine } from '@/types';

/** A slot change the machine's current state doesn't allow — e.g. swapping the product while stock of the old one is still inside. */
export class SlotChangeRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlotChangeRefusedError';
  }
}

/** Vend results after which nobody knows whether the product is stuck, dropped late or never left — the slot stops selling until someone looks. */
export const QUARANTINE_RESULTS: readonly SlotQuarantine['reason'][] = ['jam', 'unknown', 'sensor_failure'];

export interface SlotHealth {
  slotCode: string;
  /** Up to the last 20 finished vends on this slot, newest first. */
  recent: DispenseResultStatus[];
  successes: number;
  problems: number;
}

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
    actor?: string;
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
    if (!existing || existing.priceKes !== input.priceKes) {
      await machineSlotRepository.appendPriceHistory({ businessId: input.businessId, machineId: input.machineId, slotCode: input.slotCode, productId: input.productId, fromKes: existing?.priceKes ?? null, toKes: input.priceKes, changedBy: input.actor ?? 'system' });
    }
    const adapter = this.resolveAdapter(machine.manufacturer);
    await adapter.setPrice(input.machineId, input.slotCode, input.priceKes);
  }

  /**
   * A staff edit to one slot, from the slot editor. Adds the checks a
   * person needs that `configureSlot` (also used by seeding) doesn't:
   * the product can't change while the old product's stock is still in
   * the slot — that stock would be sold and counted as the new product —
   * and capacity can't drop below what's inside. Returns the slot before
   * and after, for the audit log.
   */
  async editSlot(input: {
    businessId: string;
    machineId: string;
    slotCode: string;
    productId: string | null;
    productCatalogue: MachineSlot['productCatalogue'];
    priceKes: number;
    capacity: number;
    position: number;
    actor: string;
  }): Promise<{ before: MachineSlot | null; after: MachineSlot | null }> {
    const before = await machineSlotRepository.findBySlotCode(input.businessId, input.machineId, input.slotCode);
    if (before) {
      const productChanges = before.productId !== input.productId || (input.productId !== null && before.productCatalogue !== input.productCatalogue);
      if (productChanges && before.currentQuantity > 0) {
        throw new SlotChangeRefusedError(`Slot ${input.slotCode} still holds ${before.currentQuantity} of its current product. Empty it (stock adjustment) before putting a different product in.`);
      }
      if (input.capacity < before.currentQuantity) {
        throw new SlotChangeRefusedError(`Slot ${input.slotCode} holds ${before.currentQuantity}; capacity can’t be less than that.`);
      }
    }
    await this.configureSlot(input);
    const after = await machineSlotRepository.findBySlotCode(input.businessId, input.machineId, input.slotCode);
    return { before, after };
  }

  /**
   * Copies another machine's slot layout — slot codes, products,
   * capacities, positions and (only with `includePrices`) prices — onto
   * this one. Stock is never copied. Checked as a whole first: any slot
   * here that would change product while holding stock stops the copy
   * before anything is written. Slots here that the source doesn't have
   * are left alone. Without `includePrices`, a slot that is new here
   * can't be priced, so the copy is refused if there are any.
   */
  async copyLayout(businessId: string, fromMachineId: string, toMachineId: string, options: { includePrices: boolean; actor: string }): Promise<{ copied: string[] }> {
    if (fromMachineId === toMachineId) throw new SlotChangeRefusedError('Choose a different machine to copy from.');
    const [source, target, sourceSlots, targetSlots] = await Promise.all([
      machineRepository.findById(businessId, fromMachineId),
      machineRepository.findById(businessId, toMachineId),
      machineSlotRepository.listByMachine(businessId, fromMachineId),
      machineSlotRepository.listByMachine(businessId, toMachineId),
    ]);
    if (!source) throw new MachineNotFoundError(fromMachineId);
    if (!target) throw new MachineNotFoundError(toMachineId);
    if (sourceSlots.length === 0) throw new SlotChangeRefusedError(`${source.machineCode} has no slots to copy.`);
    const existing = new Map(targetSlots.map((slot) => [slot.slotCode, slot]));
    const problems: string[] = [];
    for (const slot of sourceSlots) {
      const here = existing.get(slot.slotCode);
      if (!here && !options.includePrices) problems.push(`${slot.slotCode} is new here and needs a price`);
      if (here && here.currentQuantity > 0 && (here.productId !== slot.productId || here.productCatalogue !== slot.productCatalogue)) problems.push(`${slot.slotCode} still holds ${here.currentQuantity} of a different product`);
      if (here && slot.capacity < here.currentQuantity) problems.push(`${slot.slotCode} holds more than the copied capacity`);
    }
    if (problems.length > 0) throw new SlotChangeRefusedError(`Nothing was copied: ${problems.join('; ')}.`);
    for (const slot of sourceSlots) {
      const here = existing.get(slot.slotCode);
      await this.configureSlot({
        businessId,
        machineId: toMachineId,
        slotCode: slot.slotCode,
        productId: slot.productId,
        productCatalogue: slot.productCatalogue,
        priceKes: options.includePrices || !here ? slot.priceKes : here.priceKes,
        capacity: slot.capacity,
        position: slot.position,
        actor: options.actor,
      });
    }
    return { copied: sourceSlots.map((slot) => slot.slotCode) };
  }

  /**
   * Stops a slot selling after a vend whose result leaves the product's
   * whereabouts unknown. Snack Quest simply stops offering and charging
   * for it; nothing is sent to the machine, so this works for every
   * manufacturer. Does nothing for other results or an already-paused slot.
   */
  async quarantineAfterVend(businessId: string, machineId: string, slotCode: string, status: DispenseResultStatus, transactionId: string | null): Promise<boolean> {
    if (!(QUARANTINE_RESULTS as readonly string[]).includes(status)) return false;
    return machineSlotRepository.quarantine(businessId, machineId, slotCode, status as SlotQuarantine['reason'], transactionId);
  }

  /** "Return to sale": someone checked the slot. Clears the quarantine and switches it back on. */
  async releaseQuarantine(businessId: string, machineId: string, slotCode: string): Promise<SlotQuarantine> {
    const released = await machineSlotRepository.releaseQuarantine(businessId, machineId, slotCode);
    if (!released) throw new SlotChangeRefusedError(`Slot ${slotCode} isn’t paused.`);
    return released;
  }

  /** Each slot's recent vend results, from the dispense ledger — what shows a slot that keeps jamming before it's paused. */
  async slotHealth(businessId: string, machineId: string): Promise<SlotHealth[]> {
    const commands = await machineDispenseCommandRepository.listByMachine(businessId, machineId, 300);
    const bySlot = new Map<string, DispenseResultStatus[]>();
    for (const command of commands) {
      if (!command.dispenseResultStatus) continue;
      const list = bySlot.get(command.slotCode) ?? [];
      if (list.length < 20) list.push(command.dispenseResultStatus);
      bySlot.set(command.slotCode, list);
    }
    return [...bySlot.entries()].map(([slotCode, recent]) => ({
      slotCode,
      recent,
      successes: recent.filter((status) => status === 'success').length,
      problems: recent.filter((status) => status !== 'success').length,
    }));
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

  async setPrice(businessId: string, machineId: string, slotCode: string, priceKes: number, actor = 'system'): Promise<void> {
    if (!Number.isInteger(priceKes) || priceKes < 0 || priceKes > MAX_PRICE_KES) {
      throw new SlotMappingError(`priceKes must be a whole number of shillings between 0 and ${MAX_PRICE_KES}`);
    }
    const machine = await machineRepository.findById(businessId, machineId);
    if (!machine) {
      throw new MachineNotFoundError(machineId);
    }
    const before = await machineSlotRepository.findBySlotCode(businessId, machineId, slotCode);
    await machineSlotRepository.updatePrice(businessId, machineId, slotCode, priceKes);
    if (before && before.priceKes !== priceKes) {
      await machineSlotRepository.appendPriceHistory({ businessId, machineId, slotCode, productId: before.productId, fromKes: before.priceKes, toKes: priceKes, changedBy: actor });
    }
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
