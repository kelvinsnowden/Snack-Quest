import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import type { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { defaultVendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import { planogramService, PlanogramError } from '@/services/planogramService';
import { planogramTemplateRepository } from '@/repositories/planogramTemplateRepository';
import { machineBulkService } from '@/services/machineBulkService';

const BUSINESS_ID = 'biz-planogram-test';
// The same mock the default resolver hands the services, so applying a template reaches it too.
const adapter = defaultVendingAdapterResolver('mock') as MockVendingAdapter;
const slots = new MachineSlotService(() => adapter);

async function clean() {
  for (const collection of ['machines', 'machineSlots', 'machineSlotPriceHistory', 'planogramTemplates', 'deviceCredentials']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
}
beforeEach(clean);
afterEach(clean);

async function machine(code: string) {
  const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: code, serialNumber: `SN-${code}`, manufacturer: 'mock', model: 'test', actor: 'staff-1' });
  for (const slotCode of ['A01', 'A02']) adapter.seedSlot(machineId, slotCode, { quantity: 0 });
  return machineId;
}

describe('planogram templates', () => {
  it('saves a machine’s layout and applies it to others, prices included, stock never', async () => {
    const source = await machine('SQ-PL1');
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId: source, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 250, capacity: 8, position: 1 });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId: source, slotCode: 'A02', productId: 'pkg-2', productCatalogue: 'package', priceKes: 300, capacity: 6, position: 2 });
    await adminFirestore.collection('machineSlots').doc(`${source}__A01`).update({ currentQuantity: 5 });

    const templateId = await planogramService.saveFromMachine(BUSINESS_ID, source, { name: 'Office', suitsFor: 'Offices' }, 'staff-1');
    expect((await planogramTemplateRepository.findById(BUSINESS_ID, templateId))?.slots.map((slot) => slot.slotCode)).toEqual(['A01', 'A02']);

    const [a, b] = [await machine('SQ-PL2'), await machine('SQ-PL3')];
    // b has a slot holding stock of a different product: that machine is refused, a is set up.
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId: b, slotCode: 'A01', productId: 'pkg-9', productCatalogue: 'package', priceKes: 100, capacity: 8, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${b}__A01`).update({ currentQuantity: 2 });

    const results = await machineBulkService.run(BUSINESS_ID, [a, b], { kind: 'planogram', templateId }, 'staff-1');
    expect(results.map((r) => r.outcome)).toEqual(['done', 'failed']);
    expect(results[1].detail).toMatch(/still holds 2/);
    const applied = await machineSlotRepository.listByMachine(BUSINESS_ID, a);
    expect(applied.map((slot) => [slot.slotCode, slot.productId, slot.priceKes, slot.currentQuantity]).sort()).toEqual([
      ['A01', 'pkg-1', 250, 0],
      ['A02', 'pkg-2', 300, 0],
    ]);
  });

  it('refuses a nameless template, an empty machine and a missing template', async () => {
    const empty = await machine('SQ-PL4');
    await expect(planogramService.saveFromMachine(BUSINESS_ID, empty, { name: ' ' }, 'staff-1')).rejects.toBeInstanceOf(PlanogramError);
    await expect(planogramService.saveFromMachine(BUSINESS_ID, empty, { name: 'X' }, 'staff-1')).rejects.toThrow(/no slots/);
    await expect(planogramService.apply(BUSINESS_ID, 'missing', empty, 'staff-1')).rejects.toBeInstanceOf(PlanogramError);
  });
});
