import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { machineFleetSummaryService, FLEET_SUMMARY_MAX_AGE_MS } from '@/services/machineFleetSummaryService';
import { machineFleetSummaryRepository } from '@/repositories/machineFleetSummaryRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';

/**
 * The fleet table's stored per-machine figures: computed from the same
 * sources as before, refreshed on view only for the page's machines
 * that are stale, and refreshed for everyone nightly.
 */

const BUSINESS_ID = 'biz-fleet-summary-test';

async function clean() {
  for (const collection of ['machines', 'machineSlots', 'machineFleetSummary', 'deviceCredentials', 'machineTransactions', 'restockTasks', 'machineDailySummary']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
}
beforeEach(clean);
afterEach(clean);

async function machineWithSlots() {
  const adapter = new MockVendingAdapter();
  const { machineId } = await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-FLEET-${Math.random().toString(36).slice(2, 9)}`, serialNumber: 'SN', manufacturer: 'mock', model: 'm', actor: 'staff-1' });
  const slots = new MachineSlotService(() => adapter);
  for (const [code, quantity] of [['A01', 3], ['A02', 0], ['A03', 5]] as const) {
    adapter.seedSlot(machineId, code, { quantity });
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: code, productId: `pkg-${code}`, productCatalogue: 'package', priceKes: 200, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__${code}`).update({ currentQuantity: quantity });
  }
  // A03 is paused after a jam: switched off, so not counted as loaded, but counted as paused.
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A03`).update({ enabled: false, quarantine: { reason: 'jam', transactionId: null, since: Timestamp.now() } });
  return machineId;
}

describe('machineFleetSummaryService', () => {
  it('stores what the fleet table shows for one machine', async () => {
    const machineId = await machineWithSlots();
    const summary = await machineFleetSummaryService.refresh(BUSINESS_ID, machineId);
    expect(summary).toMatchObject({ slotCount: 2, sellableCount: 1, pausedSlotCount: 1, revenueKes7d: 0, lastSaleAt: null, lastRestockAt: null });
    const stored = await machineFleetSummaryRepository.getMany(BUSINESS_ID, [machineId]);
    expect(stored.get(machineId)).toMatchObject({ slotCount: 2, sellableCount: 1, pausedSlotCount: 1 });
    expect((await machineFleetSummaryRepository.getMany('another-business', [machineId])).size).toBe(0);
  });

  it('refreshes on view only what is missing or stale', async () => {
    const fresh = await machineWithSlots();
    const stale = await machineWithSlots();
    const missing = await machineWithSlots();
    await machineFleetSummaryService.refresh(BUSINESS_ID, fresh);
    await machineFleetSummaryService.refresh(BUSINESS_ID, stale);
    await adminFirestore.collection('machineFleetSummary').doc(stale).update({ refreshedAt: Timestamp.fromMillis(Date.now() - FLEET_SUMMARY_MAX_AGE_MS - 60_000), slotCount: 99 });
    await adminFirestore.collection('machineFleetSummary').doc(fresh).update({ slotCount: 42 });

    const page = await machineFleetSummaryService.getForPage(BUSINESS_ID, [fresh, stale, missing]);
    expect(page.get(fresh)?.slotCount).toBe(42); // fresh enough: left alone
    expect(page.get(stale)?.slotCount).toBe(2); // recomputed
    expect(page.get(missing)?.slotCount).toBe(2); // created
  });

  it('refreshes every machine nightly', async () => {
    const a = await machineWithSlots();
    const b = await machineWithSlots();
    const result = await machineFleetSummaryService.refreshAll(BUSINESS_ID);
    expect(result).toEqual({ refreshed: 2, itemErrors: [] });
    expect((await machineFleetSummaryRepository.getMany(BUSINESS_ID, [a, b])).size).toBe(2);
  });
});
