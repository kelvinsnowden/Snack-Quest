import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineTransactionService } from '@/services/machineTransactionService';
import { machineIntegrationService, IntegrationConfigurationError } from '@/services/machineIntegrationService';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { machineSettlementService } from '@/services/machineSettlementService';
import { saleTraceService } from '@/services/saleTraceService';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { dispenseCommandDocId } from '@/types';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, mockHardware, onboardManufacturer, v1, webhook, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * "Can a manufacturer be replaced without a rewrite?" — answered with a
 * test rather than an opinion. A machine that sold through manufacturer
 * A (inbound: the machine polls Snack Quest) is re-pointed at
 * manufacturer B (outbound: Snack Quest calls B's API) by configuration
 * alone. Nothing above the adapter changes: the same payment, dispense,
 * stock, settlement and trace code serves both, the machine keeps its
 * identity and history, and A loses the ability to speak for it.
 */

const BUSINESS_ID = 'biz-manufacturer-swap';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = 'f'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let a: { manufacturerId: string; modelId: string };
let b: { manufacturerId: string; modelId: string };
let machine: V1Machine;
let keyA: Key;

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  a = await onboardManufacturer(BUSINESS_ID, 'alpha', { adapterKey: 'snack_quest_gateway' });
  b = await onboardManufacturer(BUSINESS_ID, 'bravo');
  machine = await activeMachine(BUSINESS_ID, a, { adapterKey: 'snack_quest_gateway' });
  keyA = await apiKey(BUSINESS_ID, a.manufacturerId);
  await v1(keyA, machine.machineCode).heartbeat({ eventId: `hb-${Date.now()}` });
});

async function sellThroughA(): Promise<string> {
  const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, `RA${id.slice(0, 8).toUpperCase()}`);
  await machineTransactionService.authorizeVend(BUSINESS_ID, id);
  const command = await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id);
  await v1(keyA, machine.machineCode).ack(command!.commandRef);
  await v1(keyA, machine.machineCode).report(command!.commandRef, { status: 'dispensed', eventId: `a-${id}` });
  return id;
}

async function swapToB(): Promise<void> {
  await machineIntegrationService.configure(
    BUSINESS_ID,
    { machineId: machine.machineId, manufacturerId: b.manufacturerId, modelId: b.modelId, manufacturerMachineId: `BRAVO-${machine.machineCode}`, environment: 'sandbox' },
    'staff-1',
  );
  mockHardware.seedSlot(machine.machineId, 'A01', { quantity: 4 });
  await machineIntegrationRepository.setState(BUSINESS_ID, machine.machineId, 'active', 'staff-1');
}

describe('replacing a machine\'s manufacturer', () => {
  it('is configuration only: history, stock, settlement and trace carry across; the new manufacturer sells; the old one is locked out', async () => {
    const saleA = await sellThroughA();
    await swapToB();

    const integration = await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machine.machineId);
    expect(integration).toMatchObject({ manufacturerId: b.manufacturerId, adapterKey: 'mock' });
    // A's signals don't make B's integration look healthy.
    expect(integration?.signals.heartbeat).toBeNull();

    // A can no longer speak for the machine.
    expect([403, 404]).toContain((await v1(keyA, machine.machineCode).heartbeat({ eventId: 'a-after-swap' })).status);

    // B sells through the very same payment/dispense code, now outbound.
    const before = mockHardware.dispenseInstructionCount;
    const { id: saleB } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await machineTransactionService.markPaymentVerified(BUSINESS_ID, saleB, `RB${saleB.slice(0, 8).toUpperCase()}`);
    const { vendRef } = await machineTransactionService.authorizeVend(BUSINESS_ID, saleB);
    expect(mockHardware.dispenseInstructionCount - before).toBe(1);
    const hookB = await apiKey(BUSINESS_ID, b.manufacturerId, { kind: 'webhook' });
    await webhook(hookB, 'bravo', { deliveryId: `d-${saleB}`, events: [{ type: 'DISPENSE_SUCCESS', machineId: `BRAVO-${machine.machineCode}`, eventId: `b-${saleB}`, data: { vendRef } }] });

    // One machine, one stock ledger, one sales history across both manufacturers.
    const slot = await adminFirestore.collection('machineSlots').doc(`${machine.machineId}__A01`).get();
    expect(slot.get('currentQuantity')).toBe(3);
    const gross = await machineSettlementService.computeGrossForPeriod(BUSINESS_ID, machine.machineId, new Date(Date.now() - 3_600_000), new Date(Date.now() + 60_000));
    expect(gross.transactionCount).toBe(2);
    const [traceA] = await saleTraceService.trace(BUSINESS_ID, { transactionId: saleA });
    const [traceB] = await saleTraceService.trace(BUSINESS_ID, { transactionId: saleB });
    expect([traceA.verdict, traceB.verdict]).toEqual(['delivered', 'delivered']);
  });

  it('is refused while a dispense is still in flight, and allowed once it resolves', async () => {
    const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, 'RINFLIGHT1');
    await machineTransactionService.authorizeVend(BUSINESS_ID, id);

    await expect(swapToB()).rejects.toThrow(IntegrationConfigurationError);

    // The machine never collects it; it expires and is refunded. Then the swap goes through.
    await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)).update({ expiresAt: Timestamp.fromDate(new Date(Date.now() - 60_000)), updatedAt: Timestamp.fromDate(new Date(Date.now() - 180_000)) });
    await dispenseRecoveryService.sweep(BUSINESS_ID);
    await expect(swapToB()).resolves.toBeUndefined();
  });
});
