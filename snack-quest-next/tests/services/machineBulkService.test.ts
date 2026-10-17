import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { machineRepository } from '@/repositories/machineRepository';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { machineAssortmentRepository } from '@/repositories/machineAssortmentRepository';
import { BulkActionError, machineBulkService, parseBulkRequest, permissionsFor } from '@/services/machineBulkService';

const BUSINESS_ID = 'biz-bulk-test';

async function clean() {
  for (const collection of ['machines', 'machineAssortments', 'machineSlots', 'deviceCredentials', 'snackItems']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
}
beforeEach(clean);
afterEach(clean);

async function activeMachine(code: string) {
  const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: code, serialNumber: `SN-${code}`, manufacturer: 'mock', model: 'test', actor: 'staff-1' });
  for (const status of ['installing', 'testing', 'active'] as const) await machineService.updateStatus(BUSINESS_ID, machineId, status, 'staff-1');
  return machineId;
}

describe('bulk machine changes', () => {
  it('moves many machines, skipping ones already there and reporting ones that may not move', async () => {
    const [a, b] = [await activeMachine('SQ-B1'), await activeMachine('SQ-B2')];
    const { machineId: fresh } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: 'SQ-B3', serialNumber: 'SN-3', manufacturer: 'mock', model: 'test', actor: 'staff-1' });
    await machineService.updateStatus(BUSINESS_ID, b, 'maintenance', 'staff-1');

    const results = await machineBulkService.run(BUSINESS_ID, [a, b, fresh, 'missing'], { kind: 'status', to: 'maintenance' }, 'staff-1');
    expect(results.map((r) => [r.machineCode, r.outcome])).toEqual([
      ['SQ-B1', 'done'],
      ['SQ-B2', 'skipped'],
      ['SQ-B3', 'failed'],
      ['missing', 'failed'],
    ]);
    expect((await machineRepository.findById(BUSINESS_ID, a))?.status).toBe('maintenance');
  });

  it('adds a product to many catalogues, prices it, and skips machines that don’t carry it', async () => {
    const [a, b, c] = [await activeMachine('SQ-P1'), await activeMachine('SQ-P2'), await activeMachine('SQ-P3')];
    await adminFirestore.collection('snackItems').doc('snack-1').set({ businessId: BUSINESS_ID, name: 'Pocky', description: null, imageUrl: null, isActive: true });
    const product = { productCatalogue: 'snackItem' as const, productId: 'snack-1' };
    expect((await machineBulkService.run(BUSINESS_ID, [a, b], { kind: 'add_product', ...product }, 'staff-1')).every((r) => r.outcome === 'done')).toBe(true);
    const priced = await machineBulkService.run(BUSINESS_ID, [a, b, c], { kind: 'price', ...product, priceKes: 180 }, 'staff-1');
    expect(priced.map((r) => r.outcome)).toEqual(['done', 'done', 'skipped']);
    expect((await machineAssortmentRepository.findByProduct(BUSINESS_ID, b, 'snackItem', 'snack-1'))?.priceOverrideKes).toBe(180);

    const copied = await machineBulkService.run(BUSINESS_ID, [a, c], { kind: 'copy_range', fromMachineId: a, includePriceOverrides: false }, 'staff-1');
    expect(copied.map((r) => r.outcome)).toEqual(['skipped', 'done']);
    expect((await machineAssortmentService.listByMachine(BUSINESS_ID, c)).some((row) => row.productId === 'snack-1' && row.assorted)).toBe(true);
  });

  it('checks requests and asks for the same permissions as the single-machine change', () => {
    expect(() => parseBulkRequest({ machineIds: [], action: { kind: 'status', to: 'active' } })).toThrow(BulkActionError);
    expect(() => parseBulkRequest({ machineIds: ['a'], action: { kind: 'price', productCatalogue: 'snackItem', productId: 'x', priceKes: -5 } })).toThrow(BulkActionError);
    expect(permissionsFor({ kind: 'status', to: 'decommissioned' })).toContain('machines.decommission');
    expect(permissionsFor({ kind: 'copy_range', fromMachineId: 'a', includePriceOverrides: true })).toEqual(['machine_catalog.manage', 'pricing.manage']);
  });
});
