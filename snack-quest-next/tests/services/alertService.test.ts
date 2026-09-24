import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { machineRepository } from '@/repositories/machineRepository';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineSubscriptionRepository } from '@/repositories/machineSubscriptionRepository';
import { machineSettlementService } from '@/services/machineSettlementService';
import { machineInventoryMovementService } from '@/services/machineInventoryMovementService';
import { machineTelemetryEventRepository } from '@/repositories/machineTelemetryEventRepository';
import { alertService, ResolutionRequiredError } from '@/services/alertService';
import { AlertNotFoundError, AlertNotOpenError } from '@/repositories/alertRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import type { MachineSubscription } from '@/types';

/**
 * § PART 6 — ALERT CENTER. Every detection rule reads a signal some
 * other part of this codebase already produces — see
 * `alertService.ts`'s own doc comments for exactly which one — so
 * these tests seed real state through the real services/repositories
 * and prove the sweep both opens the right alert and, for a condition
 * alert, closes it again once the state changes back.
 */

const BUSINESS_ID = 'biz-alert-center-test';

async function cleanCollections() {
  for (const collection of [
    'machines',
    'machineSlots',
    'machineTransactions',
    'machineTelemetryEvents',
    'machineInventoryMovements',
    'machineSubscriptions',
    'machineSettlements',
    'restockTasks',
    'alerts',
    'deviceCredentials',
  ]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
}

beforeEach(cleanCollections);
afterEach(cleanCollections);

async function provisionActiveMachineWithSlot(adapter: MockVendingAdapter, quantity = 5, capacity = 10) {
  const { machineId } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-ALERT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serialNumber: 'SN-1',
    manufacturer: 'mock',
    model: 'test',
    actor: 'staff-1',
  });
  await machineService.updateStatus(BUSINESS_ID, machineId, 'installing', 'staff-1');
  await machineService.updateStatus(BUSINESS_ID, machineId, 'testing', 'staff-1');
  await machineService.updateStatus(BUSINESS_ID, machineId, 'active', 'staff-1');

  adapter.seedSlot(machineId, 'A01', { quantity });
  const slots = new MachineSlotService(() => adapter);
  await slots.configureSlot({ businessId: BUSINESS_ID, machineId, slotCode: 'A01', productId: 'pkg-1', productCatalogue: 'package', priceKes: 300, capacity, position: 1 });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: quantity });
  return { machineId };
}

async function backdateLastSeen(machineId: string, minutesAgo: number) {
  await adminFirestore.collection('machines').doc(machineId).update({ lastSeenAt: Timestamp.fromDate(new Date(Date.now() - minutesAgo * 60 * 1000)) });
}

describe('AlertService.evaluateAndSync — machine offline / heartbeat missing', () => {
  it('opens machine_offline for a machine with no heartbeat past the offline threshold, and auto-resolves once it reconnects', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionActiveMachineWithSlot(adapter);
    await backdateLastSeen(machineId, 20);

    await alertService.evaluateAndSync(BUSINESS_ID);
    const alerts = await alertService.listOpen(BUSINESS_ID, { type: 'machine_offline' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].data).toMatchObject({ machineId, severity: 'critical', status: 'open' });

    await machineRepository.updateLastSeen(machineId, null);
    await alertService.evaluateAndSync(BUSINESS_ID);
    expect(await alertService.listOpen(BUSINESS_ID, { type: 'machine_offline' })).toHaveLength(0);
  });

  it('opens the lower-severity heartbeat_missing, not machine_offline, for a merely stale machine', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionActiveMachineWithSlot(adapter);
    await backdateLastSeen(machineId, 8); // between the 5-minute stale and 15-minute offline thresholds

    await alertService.evaluateAndSync(BUSINESS_ID);
    expect(await alertService.listOpen(BUSINESS_ID, { type: 'heartbeat_missing' })).toHaveLength(1);
    expect(await alertService.listOpen(BUSINESS_ID, { type: 'machine_offline' })).toHaveLength(0);
    expect((await alertService.listOpen(BUSINESS_ID, { type: 'heartbeat_missing' }))[0].data.machineId).toBe(machineId);
  });

  it('never alerts on a machine that is not active yet', async () => {
    await machineService.provisionDevice({ businessId: BUSINESS_ID, machineCode: `SQ-PROV-${Date.now()}`, serialNumber: 'SN-2', manufacturer: 'mock', model: 'test', actor: 'staff-1' });
    await alertService.evaluateAndSync(BUSINESS_ID);
    expect(await alertService.listOpen(BUSINESS_ID)).toHaveLength(0);
  });
});

describe('AlertService.evaluateAndSync — stockout / stockout risk', () => {
  it('opens stockout for an empty slot and stockout_risk for a low one, and clears both once restocked', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionActiveMachineWithSlot(adapter, 0, 10); // empty

    await alertService.evaluateAndSync(BUSINESS_ID);
    const stockouts = await alertService.listOpen(BUSINESS_ID, { type: 'stockout' });
    expect(stockouts).toHaveLength(1);
    expect(stockouts[0].data.machineId).toBe(machineId);

    // Restock to a low-but-nonzero level (1/10, under the 20% threshold) — stockout clears, stockout_risk opens instead.
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 1, actor: 'staff-1' });
    await alertService.evaluateAndSync(BUSINESS_ID);
    expect(await alertService.listOpen(BUSINESS_ID, { type: 'stockout' })).toHaveLength(0);
    expect(await alertService.listOpen(BUSINESS_ID, { type: 'stockout_risk' })).toHaveLength(1);

    // Restock to a healthy level — stockout_risk clears too.
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 9, actor: 'staff-1' });
    await alertService.evaluateAndSync(BUSINESS_ID);
    expect(await alertService.listOpen(BUSINESS_ID, { type: 'stockout_risk' })).toHaveLength(0);
  });
});

describe('AlertService.evaluateAndSync — payment reconciliation', () => {
  it('opens payment_reconciliation_issue for a transaction stuck in manual_review', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionActiveMachineWithSlot(adapter);
    const transactions = new MachineTransactionService(() => adapter);
    const { id } = await transactions.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await transactions.markPaymentVerified(BUSINESS_ID, id, `mpesa-ref-${id}`);
    const { vendRef } = await transactions.authorizeVend(BUSINESS_ID, id);
    await transactions.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: false, status: 'unknown', idempotencyKey: `vend-result-${id}` }, source: 'mock', actor: 'staff-1' });

    await alertService.evaluateAndSync(BUSINESS_ID);
    const alerts = await alertService.listOpen(BUSINESS_ID, { type: 'payment_reconciliation_issue' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].data.machineId).toBe(machineId);
  });
});

describe('AlertService.evaluateAndSync — subscription and settlement', () => {
  it('opens subscription_issue for a subscription in arrears', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionActiveMachineWithSlot(adapter);
    const now = Timestamp.now() as unknown as MachineSubscription['startDate'];
    await machineSubscriptionRepository.create({
      businessId: BUSINESS_ID,
      machineId,
      partnerId: 'partner-1',
      planName: 'Standard',
      amountKes: 2000,
      frequency: 'monthly',
      status: 'in_arrears',
      startDate: now,
      currentPeriodStart: now,
      currentPeriodEnd: now,
      renewalDate: now,
      lastPaymentStatus: 'unpaid',
      lastPaidAt: null,
      arrearsKes: 2000,
      graceUntil: null,
    });

    await alertService.evaluateAndSync(BUSINESS_ID);
    const alerts = await alertService.listOpen(BUSINESS_ID, { type: 'subscription_issue' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].data.detail).toContain('2,000');
  });

  it('opens settlement_failure for a draft settlement whose period ended well in the past', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionActiveMachineWithSlot(adapter);
    const periodEnd = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId: 'partner-1', periodStart, periodEnd, actor: 'staff-1' });

    await alertService.evaluateAndSync(BUSINESS_ID);
    const alerts = await alertService.listOpen(BUSINESS_ID, { type: 'settlement_failure' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].data.machineId).toBe(machineId);
  });

  it('never flags a settlement whose period only just ended', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionActiveMachineWithSlot(adapter);
    const periodEnd = new Date(Date.now() - 60 * 60 * 1000); // one hour ago — well inside the 3-day grace
    const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    await machineSettlementService.createDraft({ businessId: BUSINESS_ID, machineId, partnerId: 'partner-1', periodStart, periodEnd, actor: 'staff-1' });

    await alertService.evaluateAndSync(BUSINESS_ID);
    expect(await alertService.listOpen(BUSINESS_ID, { type: 'settlement_failure' })).toHaveLength(0);
  });
});

describe('AlertService.evaluateAndSync — event alerts (fault, discrepancy)', () => {
  it('opens exactly one machine_fault alert per fault event, even across repeated sweeps, and never reopens it once resolved', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionActiveMachineWithSlot(adapter);
    await machineTelemetryEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      machineId,
      eventType: 'fault',
      idempotencyKey: 'fault-1',
      deviceTimestamp: null,
      payload: { code: 'E42' },
      source: 'mock',
    });

    await alertService.evaluateAndSync(BUSINESS_ID);
    await alertService.evaluateAndSync(BUSINESS_ID); // a second sweep must not create a duplicate
    const alerts = await alertService.listOpen(BUSINESS_ID, { type: 'machine_fault' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].data.detail).toContain('E42');

    await alertService.resolve(BUSINESS_ID, alerts[0].id, 'staff-1', 'Reset the machine; fault cleared.');
    await alertService.evaluateAndSync(BUSINESS_ID); // must not resurrect the resolved alert
    expect(await alertService.listOpen(BUSINESS_ID, { type: 'machine_fault' })).toHaveLength(0);
  });

  it('opens an inventory_discrepancy alert for a recorded stock count adjustment', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionActiveMachineWithSlot(adapter);
    await machineInventoryMovementService.recordDiscrepancyAdjustment({ businessId: BUSINESS_ID, machineId, slotId: 'A01', physicalCountQuantity: 3, reason: 'Physical count came up short', actor: 'staff-1' });

    await alertService.evaluateAndSync(BUSINESS_ID);
    const alerts = await alertService.listOpen(BUSINESS_ID, { type: 'inventory_discrepancy' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].data.machineId).toBe(machineId);
  });

  it('never opens an inventory_discrepancy alert when the physical count matches exactly', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionActiveMachineWithSlot(adapter, 5);
    await machineInventoryMovementService.recordDiscrepancyAdjustment({ businessId: BUSINESS_ID, machineId, slotId: 'A01', physicalCountQuantity: 5, reason: 'Routine count, no discrepancy', actor: 'staff-1' });

    await alertService.evaluateAndSync(BUSINESS_ID);
    expect(await alertService.listOpen(BUSINESS_ID, { type: 'inventory_discrepancy' })).toHaveLength(0);
  });
});

describe('AlertService.evaluateAndSync — expiry risk', () => {
  it('opens expiry_risk for a slot whose most recent restock batch expires within the warning window', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionActiveMachineWithSlot(adapter);
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days out — inside the 7-day window
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 5, expiresAt, actor: 'staff-1' });

    await alertService.evaluateAndSync(BUSINESS_ID);
    const alerts = await alertService.listOpen(BUSINESS_ID, { type: 'expiry_risk' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].data.machineId).toBe(machineId);
  });

  it('clears expiry_risk once a fresher restock pushes the expiry date safely out', async () => {
    const adapter = new MockVendingAdapter();
    const { machineId } = await provisionActiveMachineWithSlot(adapter);
    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 5, expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), actor: 'staff-1' });
    await alertService.evaluateAndSync(BUSINESS_ID);
    expect(await alertService.listOpen(BUSINESS_ID, { type: 'expiry_risk' })).toHaveLength(1);

    await machineInventoryMovementService.recordMovement({ businessId: BUSINESS_ID, machineId, slotId: 'A01', reason: 'restock', quantityDelta: 5, expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), actor: 'staff-1' });
    await alertService.evaluateAndSync(BUSINESS_ID);
    expect(await alertService.listOpen(BUSINESS_ID, { type: 'expiry_risk' })).toHaveLength(0);
  });
});

describe('AlertService — acknowledge and resolve', () => {
  it('acknowledges an open alert, setting the assignee', async () => {
    const adapter = new MockVendingAdapter();
    await provisionActiveMachineWithSlot(adapter, 0);
    await alertService.evaluateAndSync(BUSINESS_ID);
    const [{ id }] = await alertService.listOpen(BUSINESS_ID, { type: 'stockout' });

    const acknowledged = await alertService.acknowledge(BUSINESS_ID, id, 'staff-1');
    expect(acknowledged.status).toBe('acknowledged');
    expect(acknowledged.assignee).toBe('staff-1');
  });

  it('refuses to resolve without a resolution note', async () => {
    const adapter = new MockVendingAdapter();
    await provisionActiveMachineWithSlot(adapter, 0);
    await alertService.evaluateAndSync(BUSINESS_ID);
    const [{ id }] = await alertService.listOpen(BUSINESS_ID, { type: 'stockout' });

    await expect(alertService.resolve(BUSINESS_ID, id, 'staff-1', '   ')).rejects.toThrow(ResolutionRequiredError);
  });

  it('refuses to resolve or acknowledge an alert that is already resolved', async () => {
    const adapter = new MockVendingAdapter();
    await provisionActiveMachineWithSlot(adapter, 0);
    await alertService.evaluateAndSync(BUSINESS_ID);
    const [{ id }] = await alertService.listOpen(BUSINESS_ID, { type: 'stockout' });
    await alertService.resolve(BUSINESS_ID, id, 'staff-1', 'Restocked manually.');

    await expect(alertService.resolve(BUSINESS_ID, id, 'staff-1', 'again')).rejects.toThrow(AlertNotOpenError);
    await expect(alertService.acknowledge(BUSINESS_ID, id, 'staff-1')).rejects.toThrow(AlertNotOpenError);
  });

  it('throws AlertNotFoundError for an id that does not exist', async () => {
    await expect(alertService.acknowledge(BUSINESS_ID, 'does-not-exist', 'staff-1')).rejects.toThrow(AlertNotFoundError);
  });
});
