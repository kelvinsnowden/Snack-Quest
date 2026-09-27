import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService, SlotUnavailableForSaleError } from '@/services/machineTransactionService';
import type { PaymentGateway } from '@/lib/integrations/types';
import { DispenseCommandService, DispenseCommandNotFoundError, IllegalDispenseCommandTransitionError } from '@/services/dispenseCommandService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { dispenseCommandDocId } from '@/types';
import { activeIntegration, clearIntegrationCollections, createManufacturerWithModel, provisionMachine } from '../helpers/integrationFixtures';

/**
 * § MACHINE COMMAND SAFETY and § IDEMPOTENCY, tested against the
 * failure scenarios the brief lists: these are the cases that move
 * real money and real stock, so every one asserts both sides — what
 * happened to the customer's payment, and whether the machine was
 * ever (or ever again) told to dispense.
 */

const BUSINESS_ID = 'biz-dispense-command-test';

let adapter: MockVendingAdapter;
let service: MachineTransactionService;

beforeEach(async () => {
  await clearIntegrationCollections(BUSINESS_ID);
  adapter = new MockVendingAdapter();
  service = new MachineTransactionService(() => adapter);
});

async function paidTransaction(options: { quantity?: number } = {}) {
  const { machineId } = await provisionMachine(BUSINESS_ID);
  adapter.seedSlot(machineId, 'A01', { quantity: options.quantity ?? 3 });
  await new MachineSlotService(() => adapter).configureSlot({
    businessId: BUSINESS_ID,
    machineId,
    slotCode: 'A01',
    productId: 'pkg-1',
    productCatalogue: 'package',
    priceKes: 350,
    capacity: 10,
    position: 1,
  });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: options.quantity ?? 3, manufacturerSlotId: 'spiral_01' });
  const { id } = await service.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await service.markPaymentVerified(BUSINESS_ID, id, 'MPESA-RCPT-1');
  return { machineId, transactionId: id };
}

async function statusOf(transactionId: string) {
  return (await machineTransactionRepository.findById(BUSINESS_ID, transactionId))?.status;
}

async function commandOf(transactionId: string) {
  return machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, transactionId);
}

describe('happy path', () => {
  it('claims one command, tells the machine once, and records the manufacturer slot name', async () => {
    const { transactionId } = await paidTransaction();
    const result = await service.authorizeVend(BUSINESS_ID, transactionId);
    expect(result.authorized).toBe(true);
    expect(adapter.dispenseInstructionCount).toBe(1);
    expect(await statusOf(transactionId)).toBe('vend_authorized');
    const command = await commandOf(transactionId);
    expect(command?.status).toBe('acknowledged');
    expect(command?.paymentRef).toBe('MPESA-RCPT-1');
    expect(command?.manufacturerSlotId).toBe('spiral_01');
    expect(command?.statusHistory.map((entry) => entry.status)).toEqual(['requested', 'authorized', 'acknowledged']);
  });

  it('a success report completes the command and consumes inventory exactly once', async () => {
    const { machineId, transactionId } = await paidTransaction();
    const { vendRef } = await service.authorizeVend(BUSINESS_ID, transactionId);
    const report = { vendRef, dispensed: true, status: 'success', idempotencyKey: 'report-1' };
    await service.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: report, source: 'test', actor: 'device' });
    await service.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: report, source: 'test', actor: 'device' });
    expect(await statusOf(transactionId)).toBe('dispensed');
    expect((await commandOf(transactionId))?.status).toBe('dispensed');
    const movements = await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, machineId, 'A01');
    expect(movements.filter((movement) => movement.data.reason === 'sale')).toHaveLength(1);
  });
});

describe('duplicate commands', () => {
  it('a retried dispatch never reaches the machine a second time', async () => {
    const { transactionId } = await paidTransaction();
    await service.authorizeVend(BUSINESS_ID, transactionId);
    const second = await service.authorizeVend(BUSINESS_ID, transactionId);
    expect(second.authorized).toBe(true);
    expect(adapter.dispenseInstructionCount).toBe(1);
  });

  it('concurrent dispatches of the same paid transaction dispense exactly once', async () => {
    const { transactionId } = await paidTransaction();
    const dispenser = new DispenseCommandService(() => adapter);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => dispenser.dispatchForTransaction(BUSINESS_ID, transactionId, 'system:payment')),
    );
    expect(adapter.dispenseInstructionCount).toBe(1);
    expect(results.filter((result) => result.outcome === 'duplicate')).toHaveLength(4);
  }, 60_000);

  it('the command document id is derived from the transaction — the idempotency key', async () => {
    const { machineId, transactionId } = await paidTransaction();
    await service.authorizeVend(BUSINESS_ID, transactionId);
    const doc = await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(transactionId)).get();
    expect(doc.data()?.idempotencyKey).toBe(`${transactionId}:${machineId}`);
  });
});

describe('payment succeeds, dispense fails', () => {
  it('a machine refusal (slot empty) sends the customer down the refund path with nothing dispensed', async () => {
    const { machineId, transactionId } = await paidTransaction();
    adapter.seedSlot(machineId, 'A01', { quantity: 0 });
    const result = await service.authorizeVend(BUSINESS_ID, transactionId);
    expect(result.authorized).toBe(false);
    expect(await statusOf(transactionId)).toBe('paid_vend_failed');
    expect((await commandOf(transactionId))?.status).toBe('rejected');
    expect((await machineTransactionRepository.findById(BUSINESS_ID, transactionId))?.paymentRef).toBe('MPESA-RCPT-1');
  });

  it('a jam reported after acknowledgement fails the command and leaves inventory untouched', async () => {
    const { machineId, transactionId } = await paidTransaction();
    const { vendRef } = await service.authorizeVend(BUSINESS_ID, transactionId);
    await service.applyVendResult({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { vendRef, dispensed: false, status: 'jam', failureReason: 'spiral jammed', idempotencyKey: 'jam-1' },
      source: 'test',
      actor: 'device',
    });
    expect(await statusOf(transactionId)).toBe('paid_vend_failed');
    const command = await commandOf(transactionId);
    expect(command?.status).toBe('failed');
    expect(command?.dispenseResultStatus).toBe('jam');
    expect((await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, machineId, 'A01')).filter((m) => m.data.reason === 'sale')).toHaveLength(0);
  });
});

describe('network failures', () => {
  it('a timeout is UNKNOWN — manual review, never an automatic retry', async () => {
    const { machineId, transactionId } = await paidTransaction();
    adapter.setAuthorizeBehaviour(machineId, 'timeout');
    await service.authorizeVend(BUSINESS_ID, transactionId);
    expect(await statusOf(transactionId)).toBe('manual_review');
    const command = await commandOf(transactionId);
    expect(command?.status).toBe('unknown');
    // The command ref is kept as the correlation handle for a late report.
    expect(command?.vendRef).toBe(command?.commandRef);

    // Recovering the network does not trigger a second dispense.
    adapter.setAuthorizeBehaviour(machineId, 'normal');
    await service.authorizeVend(BUSINESS_ID, transactionId);
    expect(adapter.dispenseInstructionCount).toBe(1);
  });

  it('a late report resolves an unknown dispense', async () => {
    const { machineId, transactionId } = await paidTransaction();
    adapter.setAuthorizeBehaviour(machineId, 'timeout');
    await service.authorizeVend(BUSINESS_ID, transactionId);
    const command = await commandOf(transactionId);
    await service.applyVendResult({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { vendRef: command!.commandRef, dispensed: true, status: 'success', idempotencyKey: 'late-1' },
      source: 'test',
      actor: 'device',
    });
    expect(await statusOf(transactionId)).toBe('dispensed');
    expect((await commandOf(transactionId))?.status).toBe('dispensed');
  });

  it('an unreachable machine is provably not dispensed — straight to refund', async () => {
    const { machineId, transactionId } = await paidTransaction();
    adapter.setAuthorizeBehaviour(machineId, 'unreachable');
    await service.authorizeVend(BUSINESS_ID, transactionId);
    expect(await statusOf(transactionId)).toBe('paid_vend_failed');
    expect((await commandOf(transactionId))?.status).toBe('rejected');
    expect(adapter.dispenseInstructionCount).toBe(0);
  });

  it('an offline machine refuses, and the refusal is recorded against the command', async () => {
    const { machineId, transactionId } = await paidTransaction();
    adapter.setOffline(machineId);
    await service.authorizeVend(BUSINESS_ID, transactionId);
    expect(await statusOf(transactionId)).toBe('paid_vend_failed');
    expect((await commandOf(transactionId))?.failureReason).toBe('machine offline');
  });
});

describe('machine reports unknown status', () => {
  it('routes to manual review and consumes no inventory', async () => {
    const { machineId, transactionId } = await paidTransaction();
    const { vendRef } = await service.authorizeVend(BUSINESS_ID, transactionId);
    await service.applyVendResult({
      businessId: BUSINESS_ID,
      machineId,
      rawPayload: { vendRef, dispensed: false, status: 'unknown', idempotencyKey: 'u-1' },
      source: 'test',
      actor: 'device',
    });
    expect(await statusOf(transactionId)).toBe('manual_review');
    expect((await commandOf(transactionId))?.status).toBe('unknown');
    expect((await machineInventoryMovementRepository.listBySlot(BUSINESS_ID, machineId, 'A01')).filter((m) => m.data.reason === 'sale')).toHaveLength(0);
  });

  it('refuses a report from a different machine for this vend', async () => {
    const { transactionId } = await paidTransaction();
    const other = await provisionMachine(BUSINESS_ID);
    const { vendRef } = await service.authorizeVend(BUSINESS_ID, transactionId);
    const result = await service.applyVendResult({
      businessId: BUSINESS_ID,
      machineId: other.machineId,
      rawPayload: { vendRef, dispensed: true, idempotencyKey: 'spoof-1' },
      source: 'test',
      actor: 'device',
    });
    expect(result.applied).toBe(false);
    expect(await statusOf(transactionId)).toBe('vend_authorized');
  });
});

describe('integration gate', () => {
  it('a configured-but-not-activated integration never reaches the machine', async () => {
    const ids = await createManufacturerWithModel(BUSINESS_ID);
    const { machineId, transactionId } = await paidTransaction();
    await machineIntegrationService.configure(BUSINESS_ID, { machineId, ...ids, manufacturerMachineId: 'M-1', environment: 'sandbox' }, 'staff-1');
    await service.authorizeVend(BUSINESS_ID, transactionId);
    expect(adapter.dispenseInstructionCount).toBe(0);
    expect(await statusOf(transactionId)).toBe('paid_vend_failed');
    expect((await commandOf(transactionId))?.failureReason).toMatch(/not active/);
  });

  it('an active integration dispenses and records the dispense signal on success', async () => {
    const ids = await createManufacturerWithModel(BUSINESS_ID);
    const { machineId, transactionId } = await paidTransaction();
    await activeIntegration(BUSINESS_ID, machineId, ids);
    const { vendRef } = await service.authorizeVend(BUSINESS_ID, transactionId);
    await service.applyVendResult({ businessId: BUSINESS_ID, machineId, rawPayload: { vendRef, dispensed: true, idempotencyKey: 'ok-1' }, source: 'test', actor: 'device' });
    const integration = await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machineId);
    expect(integration?.signals.dispense_success).not.toBeNull();
  });

  it('a machine whose integration is not active never asks the customer to pay', async () => {
    const ids = await createManufacturerWithModel(BUSINESS_ID);
    const { machineId } = await paidTransaction();
    await machineIntegrationService.configure(BUSINESS_ID, { machineId, ...ids, manufacturerMachineId: 'M-2', environment: 'sandbox' }, 'staff-1');
    let stkPushes = 0;
    const gateway = { initiateStkPush: async () => { stkPushes += 1; return { checkoutRequestId: 'c', merchantRequestId: 'm', customerMessage: '' }; } } as unknown as PaymentGateway;
    const payments = new MachineTransactionService(() => adapter, gateway);
    await expect(payments.initiateCartPayment({ businessId: BUSINESS_ID, machineId, slotIds: ['A01'], phoneNumber: '254700000000' })).rejects.toBeInstanceOf(SlotUnavailableForSaleError);
    expect(stkPushes).toBe(0);

    await activeIntegration(BUSINESS_ID, machineId, ids, { manufacturerMachineId: 'M-2' });
    await payments.initiateCartPayment({ businessId: BUSINESS_ID, machineId, slotIds: ['A01'], phoneNumber: '254700000000' });
    expect(stkPushes).toBe(1);
  });

  it('a timeout is counted against integration health', async () => {
    const ids = await createManufacturerWithModel(BUSINESS_ID);
    const { machineId, transactionId } = await paidTransaction();
    await activeIntegration(BUSINESS_ID, machineId, ids);
    adapter.setAuthorizeBehaviour(machineId, 'timeout');
    await service.authorizeVend(BUSINESS_ID, transactionId);
    const integration = await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machineId);
    expect(integration?.errorCounts.timeout).toBe(1);
    expect(integration?.lastError?.kind).toBe('timeout');
  });
});

describe('device progress reports', () => {
  it('rejects progress on another machine\'s command as not found', async () => {
    const { transactionId } = await paidTransaction();
    const other = await provisionMachine(BUSINESS_ID);
    await service.authorizeVend(BUSINESS_ID, transactionId);
    const command = await commandOf(transactionId);
    const dispenser = new DispenseCommandService(() => adapter);
    await expect(dispenser.recordProgress(BUSINESS_ID, other.machineId, command!.commandRef, 'dispensing')).rejects.toThrow(DispenseCommandNotFoundError);
  });

  it('treats a repeated progress report as a no-op', async () => {
    const { machineId, transactionId } = await paidTransaction();
    await service.authorizeVend(BUSINESS_ID, transactionId);
    const command = await commandOf(transactionId);
    const dispenser = new DispenseCommandService(() => adapter);
    await dispenser.recordProgress(BUSINESS_ID, machineId, command!.commandRef, 'dispensing');
    const again = await dispenser.recordProgress(BUSINESS_ID, machineId, command!.commandRef, 'dispensing');
    expect(again.command.status).toBe('dispensing');
    expect(again.changed).toBe(false);
  });

  it('refuses a queued command acknowledged after it expired, so the machine never dispenses it', async () => {
    const { machineId, transactionId } = await paidTransaction();
    const dispenser = new DispenseCommandService(() => adapter);
    await dispenser.dispatchForTransaction(BUSINESS_ID, transactionId, 'test');
    // Simulate a queued command the machine collected too late.
    await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(transactionId)).update({
      status: 'sent',
      delivery: 'queued',
      expiresAt: Timestamp.fromDate(new Date(Date.now() - 1000)),
    });
    const command = await commandOf(transactionId);
    await expect(dispenser.recordProgress(BUSINESS_ID, machineId, command!.commandRef, 'acknowledged')).rejects.toThrow(IllegalDispenseCommandTransitionError);
    expect((await commandOf(transactionId))?.status).toBe('timeout');
  });
});

describe('sweepTimedOut', () => {
  it('times out in-flight commands with no outcome, leaving fresh ones alone', async () => {
    const { transactionId } = await paidTransaction();
    await service.authorizeVend(BUSINESS_ID, transactionId);
    const dispenser = new DispenseCommandService(() => adapter);
    expect(await dispenser.sweepTimedOut(BUSINESS_ID)).toEqual({ timedOut: 0 });
    expect(await dispenser.sweepTimedOut(BUSINESS_ID, -1000)).toEqual({ timedOut: 1 });
    expect((await commandOf(transactionId))?.status).toBe('timeout');
  });
});
