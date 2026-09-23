import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { initiateStkPushMock } = vi.hoisted(() => ({ initiateStkPushMock: vi.fn() }));

vi.mock('@/lib/integrations/daraja/darajaGateway', () => ({
  darajaGateway: {
    initiateStkPush: initiateStkPushMock,
    verifyCallback: vi.fn(),
    queryStkStatus: vi.fn(),
  },
}));

import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { machineTransactionService } from '@/services/machineTransactionService';
import { machineCommandService } from '@/services/machineCommandService';
import { machineCommandRepository } from '@/repositories/machineCommandRepository';
import { machineTelemetryEventRepository } from '@/repositories/machineTelemetryEventRepository';
import type { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import { defaultVendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import { InProcessRouteCaller } from '@/scripts/vendingSimulator/routeCaller';
import { SimulatedMachine } from '@/scripts/vendingSimulator/simulatedMachine';

/**
 * The real Route Handlers this simulator drives all resolve their
 * hardware adapter through `defaultVendingAdapterResolver`, which
 * always returns the *same* shared `MockVendingAdapter` instance
 * (see that module's own doc comment) — not whatever instance a test
 * constructs itself. Getting a reference to that shared instance,
 * rather than `new MockVendingAdapter()`, is what makes `seedSlot`
 * calls here actually visible to `authorizeVend` when a real route
 * handler runs it. Safe to share across this file's test cases
 * because every machine id is freshly generated per test.
 */
const sharedAdapter = defaultVendingAdapterResolver('mock') as MockVendingAdapter;

/**
 * The simulator's own smoke test (§24, docs/VENDING_OS_BENCHMARK.md
 * §C/§H) — proves `SimulatedMachine` + `InProcessRouteCaller` actually
 * drive the real Route Handlers correctly, for a small fleet, before
 * either is trusted for a larger run. "Safaricom" here is played by
 * this test calling `machineTransactionService.handleMpesaCallback`
 * directly with a constructed result — a real machine never talks to
 * Safaricom itself, so simulating *that* leg is the test harness's
 * job, not `SimulatedMachine`'s; the webhook route's own signature
 * verification and routing branch are already covered by
 * `tests/api/darajaStkWebhook.test.ts`.
 */

const BUSINESS_ID = 'snack-quest';
const ORIGINAL_BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID;

beforeEach(async () => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  vi.clearAllMocks();
  for (const collection of ['machines', 'machineSlots', 'machineTransactions', 'machineInventoryMovements', 'machineTelemetryEvents', 'machineCommands', 'deviceCredentials', 'restockTasks']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

afterEach(() => {
  if (ORIGINAL_BUSINESS_ID === undefined) {
    delete process.env.SNACK_QUEST_BUSINESS_ID;
  } else {
    process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL_BUSINESS_ID;
  }
});

async function provisionSimulatedMachine(adapter: MockVendingAdapter, caller: InProcessRouteCaller, quantity = 5) {
  const { machineId, credential } = await machineService.provisionDevice({
    businessId: BUSINESS_ID,
    machineCode: `SQ-SIM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    serialNumber: 'SN-SIM',
    manufacturer: 'mock',
    model: 'simulated',
    actor: 'simulator',
  });
  adapter.seedSlot(machineId, 'A01', { quantity });
  const slots = new MachineSlotService(() => adapter);
  await slots.configureSlot({
    businessId: BUSINESS_ID,
    machineId,
    slotCode: 'A01',
    productId: 'pkg-1',
    productCatalogue: 'package',
    priceKes: 350,
    capacity: 10,
    position: 1,
  });
  await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: quantity });
  return { machineId, machine: new SimulatedMachine(caller, machineId, credential.secret) };
}

describe('vendingSimulator', () => {
  it('drives a small fleet through heartbeat, duplicate telemetry, out-of-order telemetry, and a fault report', async () => {
    const adapter = sharedAdapter;
    const caller = new InProcessRouteCaller();
    const { machineId, machine } = await provisionSimulatedMachine(adapter, caller);

    const heartbeat = await machine.sendHeartbeat();
    expect(heartbeat.status).toBe(200);
    const afterHeartbeat = await machineService.findById(BUSINESS_ID, machineId);
    expect(afterHeartbeat?.lastSeenAt).not.toBeNull();

    const dup = await machine.sendDuplicateTelemetry('door_open');
    expect(dup.firstStatus).toBe(200);
    expect(dup.secondStatus).toBe(200); // idempotent — the retry is accepted, not rejected

    await machine.sendOutOfOrderTelemetry();

    const fault = await machine.reportFault('E42');
    expect(fault.status).toBe(200);

    const events = await machineTelemetryEventRepository.listByMachine(BUSINESS_ID, machineId);
    // heartbeat(1) + duplicate door_open(1, not 2) + out-of-order pair(2) + fault(1) = 5
    expect(events).toHaveLength(5);
    expect(events.filter((e) => e.data.eventType === 'fault')).toHaveLength(1);
  });

  it('goOffline() makes every call a reported no-op rather than an error', async () => {
    const adapter = sharedAdapter;
    const caller = new InProcessRouteCaller();
    const { machine } = await provisionSimulatedMachine(adapter, caller);

    machine.goOffline();
    const heartbeat = await machine.sendHeartbeat();
    expect(heartbeat.sent).toBe(false);

    machine.comeBackOnline();
    const afterReconnect = await machine.sendHeartbeat();
    expect(afterReconnect.sent).toBe(true);
    expect(afterReconnect.status).toBe(200);
  });

  it('drives a full purchase end to end: initiate, "Safaricom" confirms, poll, report dispensed', async () => {
    const adapter = sharedAdapter;
    const caller = new InProcessRouteCaller();
    const { machineId, machine } = await provisionSimulatedMachine(adapter, caller);

    initiateStkPushMock.mockResolvedValue({
      merchantRequestId: 'mr-sim-1',
      checkoutRequestId: 'ws_CO_sim_1',
      responseCode: '0',
      responseDescription: 'Success',
      customerMessage: 'Enter your PIN',
    });

    // Sequenced deliberately, not raced: `initiatePurchase` must fully
    // persist `checkoutRequestId` before "Safaricom" can find it by
    // that id, exactly the real order of events (the STK push reaches
    // Safaricom before any callback about it can exist). Once that's
    // settled, `waitForAuthorizationAndReport`'s own poll loop is what
    // stands in for the real race against a real, asynchronous
    // callback.
    const initiated = await machine.initiatePurchase('A01', '0712345678');
    expect(initiated.initiateStatus).toBe(201);

    await machineTransactionService.handleMpesaCallback(BUSINESS_ID, {
      checkoutRequestId: 'ws_CO_sim_1',
      merchantRequestId: 'mr-sim-1',
      resultCode: 0,
      resultDesc: 'Success',
      amountKes: 350,
      mpesaReceiptNumber: 'SIMRECEIPT1',
    });

    const outcome = await machine.waitForAuthorizationAndReport(initiated.transactionId!, { dispenseOutcome: 'success' });
    expect(outcome.finalStatus).toBe('vend_authorized');
    expect(outcome.vendResultStatus).toBe(200);

    const transaction = await machineTransactionService.findById(BUSINESS_ID, initiated.transactionId!);
    expect(transaction?.status).toBe('dispensed');
    expect(transaction?.paymentRef).toBe('SIMRECEIPT1');

    const slots = await adapter.getSlots(machineId);
    expect(slots.find((s) => s.slotCode === 'A01')?.quantity).toBe(4); // 5 seeded, one dispensed
  });

  it('a failed dispense report leaves the transaction in paid_vend_failed, never dispensed', async () => {
    const adapter = sharedAdapter;
    const caller = new InProcessRouteCaller();
    const { machine } = await provisionSimulatedMachine(adapter, caller);

    initiateStkPushMock.mockResolvedValue({
      merchantRequestId: 'mr-sim-2',
      checkoutRequestId: 'ws_CO_sim_2',
      responseCode: '0',
      responseDescription: 'Success',
      customerMessage: 'Enter your PIN',
    });

    const initiated = await machine.initiatePurchase('A01', '0712345678');
    await machineTransactionService.handleMpesaCallback(BUSINESS_ID, {
      checkoutRequestId: 'ws_CO_sim_2',
      merchantRequestId: 'mr-sim-2',
      resultCode: 0,
      resultDesc: 'Success',
      amountKes: 350,
      mpesaReceiptNumber: 'SIMRECEIPT2',
    });
    await machine.waitForAuthorizationAndReport(initiated.transactionId!, { dispenseOutcome: 'failure' });

    const transaction = await machineTransactionService.findById(BUSINESS_ID, initiated.transactionId!);
    expect(transaction?.status).toBe('paid_vend_failed');
    expect(transaction?.failureReason).toBe('jam');
  });

  it('a machine that never reports a dispense result leaves the transaction authorized, ready for the reconciliation sweep', async () => {
    const adapter = sharedAdapter;
    const caller = new InProcessRouteCaller();
    const { machine } = await provisionSimulatedMachine(adapter, caller);

    initiateStkPushMock.mockResolvedValue({
      merchantRequestId: 'mr-sim-3',
      checkoutRequestId: 'ws_CO_sim_3',
      responseCode: '0',
      responseDescription: 'Success',
      customerMessage: 'Enter your PIN',
    });

    const initiated = await machine.initiatePurchase('A01', '0712345678');
    await machineTransactionService.handleMpesaCallback(BUSINESS_ID, {
      checkoutRequestId: 'ws_CO_sim_3',
      merchantRequestId: 'mr-sim-3',
      resultCode: 0,
      resultDesc: 'Success',
      amountKes: 350,
      mpesaReceiptNumber: 'SIMRECEIPT3',
    });
    const outcome = await machine.waitForAuthorizationAndReport(initiated.transactionId!, { dispenseOutcome: 'never-report' });

    expect(outcome.vendResultStatus).toBeUndefined();
    const transaction = await machineTransactionService.findById(BUSINESS_ID, initiated.transactionId!);
    expect(transaction?.status).toBe('vend_authorized');

    await adminFirestore.collection('machineTransactions').doc(initiated.transactionId!).update({ updatedAt: new Date(Date.now() - 60 * 60 * 1000) });
    const swept = await machineTransactionService.reconcileStuckTransactions(BUSINESS_ID, 15 * 60 * 1000);
    expect(swept.movedToManualReview).toBe(1);
    expect((await machineTransactionService.findById(BUSINESS_ID, initiated.transactionId!))?.status).toBe('manual_review');
  });

  it('polls a real issued command, acknowledges it, and reports completion', async () => {
    const adapter = sharedAdapter;
    const caller = new InProcessRouteCaller();
    const { machineId, machine } = await provisionSimulatedMachine(adapter, caller);

    const { commandId } = await machineCommandService.issueCommand({
      businessId: BUSINESS_ID,
      machineId,
      commandType: 'restart',
      requestedBy: 'staff-1',
    });

    const results = await machine.pollAndExecuteCommands({ outcome: 'success' });
    expect(results).toEqual([{ commandId, commandType: 'restart', ackStatus: 200, completeStatus: 200 }]);

    const command = await machineCommandRepository.findById(BUSINESS_ID, commandId);
    expect(command?.status).toBe('completed');

    // A second poll sees nothing new — the command is no longer pending.
    const secondPoll = await machine.pollAndExecuteCommands();
    expect(secondPoll).toEqual([]);
  });

  it('reports a failed command execution verbatim, never silently as success', async () => {
    const adapter = sharedAdapter;
    const caller = new InProcessRouteCaller();
    const { machineId, machine } = await provisionSimulatedMachine(adapter, caller);

    await machineCommandService.issueCommand({
      businessId: BUSINESS_ID,
      machineId,
      commandType: 'restart',
      requestedBy: 'staff-1',
    });

    const results = await machine.pollAndExecuteCommands({ outcome: 'failure', failureReason: 'watchdog reset failed' });
    expect(results[0].completeStatus).toBe(200);

    const command = await machineCommandRepository.findById(BUSINESS_ID, results[0].commandId);
    expect(command?.status).toBe('failed');
    expect(command?.error).toBe('watchdog reset failed');
  });

  it('an offline machine never polls, ackowledges, or executes a command', async () => {
    const adapter = sharedAdapter;
    const caller = new InProcessRouteCaller();
    const { machineId, machine } = await provisionSimulatedMachine(adapter, caller);

    const { commandId } = await machineCommandService.issueCommand({
      businessId: BUSINESS_ID,
      machineId,
      commandType: 'restart',
      requestedBy: 'staff-1',
    });

    machine.goOffline();
    const results = await machine.pollAndExecuteCommands();
    expect(results).toEqual([]);

    const command = await machineCommandRepository.findById(BUSINESS_ID, commandId);
    expect(command?.status).toBe('pending'); // untouched
  });
});
