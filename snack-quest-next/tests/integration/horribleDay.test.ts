import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineTransactionService } from '@/services/machineTransactionService';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { integrationCredentialService } from '@/services/integrationCredentialService';
import { alertService } from '@/services/alertService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { HardwareUnreachableError } from '@/lib/vending/hardwareAdapter';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { dispenseCommandDocId, type Alert, type AlertType } from '@/types';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, mockHardware, onboardManufacturer, signed, routes, v1, webhook, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * THE HORRIBLE DAY — scenarios A–T of the pre-production brief, each
 * driven through the real API routes and services against the
 * emulator. Every scenario answers the same five questions, as
 * assertions rather than prose:
 *
 *   money      — is the customer's money handled correctly (never
 *                refunded when the product may have come out, never
 *                kept when it provably didn't, never taken twice)?
 *   dispense   — can the machine be told to dispense twice?
 *   inventory  — is the stock ledger still exactly right?
 *   recovery   — does it resolve without a human where that's safe?
 *   alert      — is an operator told when a human is needed?
 *
 * docs/MACHINE_INTEGRATION_READINESS.md §6 summarises the outcome of
 * each scenario; this file is the evidence.
 */

const BUSINESS_ID = 'biz-horrible-day';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };

beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = 'e'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

type Ids = { manufacturerId: string; modelId: string };
let inboundIds: Ids;
let outboundIds: Ids;
/** Model B: the machine polls Snack Quest (snack_quest_gateway adapter). */
let machine: V1Machine;
let key: Key;
let hookKey: Key;
/** Model A: Snack Quest calls the manufacturer (mock outbound adapter). */
let outbound: V1Machine;

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  for (const collection of ['alerts', 'alertEvaluationRuns', 'webhookEvents']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  await adminFirestore.collection('alertEvaluationRuns').doc(BUSINESS_ID).delete();
  inboundIds = await onboardManufacturer(BUSINESS_ID, 'dayin', { adapterKey: 'snack_quest_gateway' });
  outboundIds = await onboardManufacturer(BUSINESS_ID, 'dayout');
  machine = await activeMachine(BUSINESS_ID, inboundIds, { adapterKey: 'snack_quest_gateway' });
  key = await apiKey(BUSINESS_ID, inboundIds.manufacturerId);
  outbound = await activeMachine(BUSINESS_ID, outboundIds);
  // Webhooks are how an outbound/hybrid manufacturer pushes outcomes; an inbound-only integration has none.
  hookKey = await apiKey(BUSINESS_ID, outboundIds.manufacturerId, { kind: 'webhook' });
  await v1(key, machine.machineCode).heartbeat({ eventId: `hb-${Date.now()}` });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── helpers ──────────────────────────────────────────────────────────

async function paid(machineId: string): Promise<string> {
  const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, `R${id.slice(0, 8).toUpperCase()}`);
  return id;
}

async function paidAndQueued(): Promise<{ id: string; commandRef: string }> {
  const id = await paid(machine.machineId);
  await machineTransactionService.authorizeVend(BUSINESS_ID, id);
  const command = await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id);
  return { id, commandRef: command!.commandRef };
}

/** The three ledgers for one sale, plus the slot's stock. */
async function ledger(id: string, machineId = machine.machineId) {
  const [transaction, commands, movements, slot] = await Promise.all([
    machineTransactionRepository.findById(BUSINESS_ID, id),
    adminFirestore.collection('machineDispenseCommands').where('transactionId', '==', id).get(),
    adminFirestore.collection('machineInventoryMovements').where('sourceTransactionId', '==', id).where('reason', '==', 'sale').get(),
    adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).get(),
  ]);
  return { status: transaction?.status, commands: commands.size, command: commands.docs[0]?.data(), saleMovements: movements.size, stock: slot.get('currentQuantity') as number };
}

async function openAlerts(type?: AlertType): Promise<Alert[]> {
  await alertService.evaluateAndSync(BUSINESS_ID);
  return (await alertService.listOpen(BUSINESS_ID, type ? { type } : {})).map(({ data }) => data);
}

const ago = (seconds: number) => Timestamp.fromDate(new Date(Date.now() - seconds * 1000));

async function silence(machineId: string, seconds: number) {
  await adminFirestore.collection('machineIntegrations').doc(machineId).update({ configuredAt: ago(seconds + 3600), 'signals.heartbeat': ago(seconds), 'signals.api_request': ago(seconds), 'signals.webhook': null });
  await adminFirestore.collection('machines').doc(machineId).update({ lastSeenAt: ago(seconds) });
}

async function inParallel<T>(count: number, concurrency: number, task: (index: number) => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  for (let start = 0; start < count; start += concurrency) {
    results.push(...(await Promise.all(Array.from({ length: Math.min(concurrency, count - start) }, (_, offset) => task(start + offset)))));
  }
  return results;
}

// ─── scenarios ────────────────────────────────────────────────────────

describe('A — payment succeeds, then the machine disconnects', () => {
  it('inbound: the uncollected dispense expires and is refunded; the machine is refused if it comes back late; staff are alerted', async () => {
    const { id, commandRef } = await paidAndQueued();
    await silence(machine.machineId, 3600);
    // Queued two minutes ago, expired since; the machine never came for it.
    await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)).update({ expiresAt: ago(60), updatedAt: ago(180) });

    await dispenseRecoveryService.sweep(BUSINESS_ID);
    expect(await ledger(id)).toMatchObject({ status: 'paid_vend_failed', commands: 1, saleMovements: 0, stock: 5 });
    expect((await openAlerts('machine_offline')).map((a) => a.machineId)).toContain(machine.machineId);

    // It reconnects and tries to act on the stale command: refused, nothing moves.
    expect((await v1(key, machine.machineCode).commands()).data.commands).toEqual([]);
    expect((await v1(key, machine.machineCode).ack(commandRef)).status).toBe(409);
    expect(await ledger(id)).toMatchObject({ status: 'paid_vend_failed', saleMovements: 0, stock: 5 });
  });

  it('inbound: a machine already silent is refused before the customer pays', async () => {
    await silence(machine.machineId, 600);
    expect(await machineIntegrationService.dispenseGate(BUSINESS_ID, machine.machineId, 'pre_payment')).toMatchObject({ allowed: false });
  });

  it('outbound: the machine refuses while offline — provably not dispensed, refund path', async () => {
    mockHardware.setOffline(outbound.machineId);
    const before = mockHardware.dispenseInstructionCount;
    const id = await paid(outbound.machineId);
    await machineTransactionService.authorizeVend(BUSINESS_ID, id);
    expect(await ledger(id, outbound.machineId)).toMatchObject({ status: 'paid_vend_failed', saleMovements: 0, stock: 5 });
    expect(mockHardware.dispenseInstructionCount).toBe(before);
    mockHardware.setOnline(outbound.machineId);
  });
});

describe('B — the snack drops, then the network dies before confirmation', () => {
  it('the confirmation retried after a lost response is applied once: one stock movement, no refund', async () => {
    const { id, commandRef } = await paidAndQueued();
    const client = v1(key, machine.machineCode);
    await client.ack(commandRef);
    const first = await client.report(commandRef, { status: 'dispensed', eventId: `drop-${id}` });
    expect(first.data).toMatchObject({ result: 'applied' });
    // The machine never saw that response; it sends the same report again, twice.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const retry = await client.report(commandRef, { status: 'dispensed', eventId: `drop-${id}` });
      expect(retry.status).toBe(200);
      expect(retry.data).toMatchObject({ applied: false, result: 'duplicate' });
    }
    expect(await ledger(id)).toMatchObject({ status: 'dispensed', saleMovements: 1, stock: 4 });
  });

  it('no confirmation at all: never refunded automatically — reviewed, and resolved by the late truth', async () => {
    const { id, commandRef } = await paidAndQueued();
    await v1(key, machine.machineCode).ack(commandRef);
    await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)).update({ updatedAt: ago(600) });
    await dispenseRecoveryService.sweep(BUSINESS_ID);
    expect(await ledger(id)).toMatchObject({ status: 'manual_review', saleMovements: 0 });

    const beat = await v1(key, machine.machineCode).heartbeat({ eventId: `hb-B-${Date.now()}` });
    expect((beat.data as { reportOutcomes: { commandId: string }[] }).reportOutcomes.map((r) => r.commandId)).toContain(commandRef);
    await v1(key, machine.machineCode).report(commandRef, { status: 'dispensed', eventId: `late-${id}` });
    expect(await ledger(id)).toMatchObject({ status: 'dispensed', saleMovements: 1, stock: 4 });
  });
});

describe('C — the manufacturer sends the same webhook 100 times', () => {
  it('applied exactly once; every redelivery is acknowledged as a duplicate', async () => {
    const id = await paid(outbound.machineId);
    const { vendRef } = await machineTransactionService.authorizeVend(BUSINESS_ID, id);
    const body = { deliveryId: `d-C-${id}`, events: [{ type: 'DISPENSE_SUCCESS', machineId: outbound.manufacturerMachineId, eventId: `w-C-${id}`, data: { vendRef } }] };
    const results = await inParallel(100, 10, () => webhook(hookKey, 'dayout', body));
    expect(results.every((r) => r.status === 200 || r.status === 202)).toBe(true);
    expect(results.filter((r) => (r.data as { dispenseOutcomesApplied?: number }).dispenseOutcomesApplied === 1)).toHaveLength(1);
    expect(await ledger(id, outbound.machineId)).toMatchObject({ status: 'dispensed', saleMovements: 1, stock: 4 });
  }, 60_000);
});

describe('D — events arrive out of order', () => {
  it('a late "dispensing" after "dispensed" changes nothing', async () => {
    const { id, commandRef } = await paidAndQueued();
    const client = v1(key, machine.machineCode);
    await client.report(commandRef, { status: 'dispensed', eventId: `D-done-${id}` });
    const late = await client.report(commandRef, { status: 'dispensing', eventId: `D-progress-${id}` });
    expect(late.data).toMatchObject({ applied: false });
    expect(await ledger(id)).toMatchObject({ status: 'dispensed', saleMovements: 1, stock: 4 });
  });

  it('an older status snapshot never overwrites a newer one', async () => {
    const client = v1(key, machine.machineCode);
    const now = Date.now();
    await client.status({ eventId: 'D-s2', occurredAt: new Date(now).toISOString(), online: true, doorOpen: false });
    const older = await client.status({ eventId: 'D-s1', occurredAt: new Date(now - 60_000).toISOString(), online: true, doorOpen: true });
    expect(older.data).toMatchObject({ applied: false });
    expect((await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machine.machineId))?.lastReportedStatus?.doorOpen).toBe(false);
  });

  it('"failed" arriving after money was settled as dispensed: money unchanged, conflict raised to a human', async () => {
    const { id, commandRef } = await paidAndQueued();
    const client = v1(key, machine.machineCode);
    await client.report(commandRef, { status: 'dispensed', eventId: `D-ok-${id}` });
    const contradiction = await client.report(commandRef, { status: 'failed', eventId: `D-fail-${id}`, failureCode: 'jam' });
    expect(contradiction.status).toBe(200);
    expect(await ledger(id)).toMatchObject({ status: 'dispensed', saleMovements: 1, stock: 4 });
    expect((await openAlerts('dispense_conflict')).length).toBe(1);
  });
});

describe('E — a heartbeat arrives after the machine was considered offline', () => {
  it('it is ONLINE again, the return is recorded, and the offline alert closes itself', async () => {
    await silence(machine.machineId, 3600);
    expect((await machineIntegrationService.getView(BUSINESS_ID, machine.machineId))?.liveness?.state).toBe('OFFLINE');
    expect((await openAlerts('machine_offline')).length).toBe(1);

    const onlineEvents = async () => (await adminFirestore.collection('machineEvents').where('machineId', '==', machine.machineId).where('type', '==', 'MACHINE_ONLINE').get()).size;
    const before = await onlineEvents();
    await v1(key, machine.machineCode).heartbeat({ eventId: `hb-E-${Date.now()}` });
    await v1(key, machine.machineCode).heartbeat({ eventId: `hb-E2-${Date.now()}` });
    expect((await machineIntegrationService.getView(BUSINESS_ID, machine.machineId))?.liveness?.state).toBe('ONLINE');
    // One return, recorded once — the next heartbeat is ordinary.
    expect((await onlineEvents()) - before).toBe(1);
    expect(await openAlerts('machine_offline')).toEqual([]);
  });
});

describe('F — two Snack Quest servers attempt the same dispense', () => {
  it('outbound: the machine is told once', async () => {
    const id = await paid(outbound.machineId);
    const before = mockHardware.dispenseInstructionCount;
    await Promise.all(Array.from({ length: 5 }, () => machineTransactionService.authorizeVend(BUSINESS_ID, id)));
    expect(mockHardware.dispenseInstructionCount - before).toBe(1);
    expect(await ledger(id, outbound.machineId)).toMatchObject({ status: 'vend_authorized', commands: 1 });
  });

  it('inbound: one command is queued, and the machine collects exactly one', async () => {
    const id = await paid(machine.machineId);
    await Promise.all(Array.from({ length: 5 }, () => machineTransactionService.authorizeVend(BUSINESS_ID, id)));
    expect((await ledger(id)).commands).toBe(1);
    expect((await v1(key, machine.machineCode).commands()).data.commands.filter((c) => c.type === 'dispense')).toHaveLength(1);
  });
});

describe('G — the manufacturer API is unavailable for 30 minutes', () => {
  it('connection refused: provably not sent, so refunded — and the next customer is not charged into the outage', async () => {
    mockHardware.setAuthorizeBehaviour(outbound.machineId, 'unreachable');
    const id = await paid(outbound.machineId);
    await machineTransactionService.authorizeVend(BUSINESS_ID, id);
    expect(await ledger(id, outbound.machineId)).toMatchObject({ status: 'paid_vend_failed', saleMovements: 0 });
    expect(await machineIntegrationService.dispenseGate(BUSINESS_ID, outbound.machineId, 'pre_payment')).toMatchObject({ allowed: false });

    // After the breaker window one order is let through as the probe.
    await adminFirestore.collection('machineIntegrations').doc(outbound.machineId).update({ 'lastError.at': ago(180) });
    expect(await machineIntegrationService.dispenseGate(BUSINESS_ID, outbound.machineId, 'pre_payment')).toMatchObject({ allowed: true });
    mockHardware.setAuthorizeBehaviour(outbound.machineId, 'normal');
  });

  it('timed out mid-call: may have dispensed — reviewed, never refunded or retried; pulled with backoff until the API returns', async () => {
    mockHardware.setAuthorizeBehaviour(outbound.machineId, 'timeout');
    const before = mockHardware.dispenseInstructionCount;
    const id = await paid(outbound.machineId);
    await machineTransactionService.authorizeVend(BUSINESS_ID, id);
    expect(await ledger(id, outbound.machineId)).toMatchObject({ status: 'manual_review', saleMovements: 0 });
    mockHardware.setAuthorizeBehaviour(outbound.machineId, 'normal');

    const status = vi.spyOn(mockHardware, 'getDispenseStatus').mockRejectedValue(new HardwareUnreachableError('mock', 'still down'));
    expect((await machineTransactionService.reconcileUnknownDispenses(BUSINESS_ID)).resolved).toBe(0);
    expect((await ledger(id, outbound.machineId)).command).toMatchObject({ reconcileAttempts: 1 });
    // Backed off: an immediate second sweep does not call the API again.
    const calls = status.mock.calls.length;
    await machineTransactionService.reconcileUnknownDispenses(BUSINESS_ID);
    expect(status.mock.calls.length).toBe(calls);

    // The API is back; the next due attempt resolves it.
    await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)).update({ nextReconcileAt: ago(1) });
    status.mockImplementation(async (_machineId: string, vendRef: string) => ({ vendRef, state: 'success', failureReason: null }));
    expect((await machineTransactionService.reconcileUnknownDispenses(BUSINESS_ID)).resolved).toBe(1);
    expect(await ledger(id, outbound.machineId)).toMatchObject({ status: 'dispensed', saleMovements: 1 });
    expect(mockHardware.dispenseInstructionCount - before).toBe(1);
  });
});

describe('H — the credential is revoked while requests are in flight', () => {
  it('in-flight requests finish or fail cleanly; everything after is refused', async () => {
    const client = v1(key, machine.machineCode);
    const inFlight = Promise.all(Array.from({ length: 5 }, (_, i) => client.heartbeat({ eventId: `hb-H-${i}-${Date.now()}` })));
    await integrationCredentialService.revoke(BUSINESS_ID, key.keyId, 'suspected leak', 'staff-1');
    for (const result of await inFlight) {
      expect([202, 401]).toContain(result.status);
    }
    const after = await client.heartbeat({ eventId: `hb-H-after-${Date.now()}` });
    expect(after.status).toBe(401);
    expect(after.error?.code).toBe('key_revoked');
  });

  it('rotation keeps the fleet online: old and new keys both work during the grace period', async () => {
    const next = await integrationCredentialService.rotate(BUSINESS_ID, key.keyId, { graceHours: 24 }, 'staff-1');
    expect((await v1(key, machine.machineCode).heartbeat({ eventId: `hb-H-old-${Date.now()}` })).status).toBe(202);
    expect((await v1(next, machine.machineCode).heartbeat({ eventId: `hb-H-new-${Date.now()}` })).status).toBe(202);
  });
});

describe('I — the machine reports inventory that contradicts Snack Quest', () => {
  it('reported, never trusted: the ledger is unchanged and staff are alerted', async () => {
    const result = await v1(key, machine.machineCode).inventory({ reportId: 'inv-I', slots: [{ slotId: 'spiral_01', quantity: 2 }] });
    expect(result.data).toMatchObject({ mismatches: [{ slotId: 'spiral_01', expected: 5, reported: 2 }] });
    expect((await ledger('none')).stock).toBe(5);
    expect((await openAlerts('inventory_discrepancy')).length).toBe(1);
  });
});

describe('J — the machine reports a dispense Snack Quest does not recognise', () => {
  it('through a webhook: nothing moves, and staff are told product may have left unpaid', async () => {
    const body = { deliveryId: 'd-J', events: [{ type: 'DISPENSE_SUCCESS', machineId: outbound.manufacturerMachineId, eventId: 'w-J', data: { vendRef: 'mock-vend-not-ours' } }] };
    const result = await webhook(hookKey, 'dayout', body);
    expect(result.status).toBeLessThan(300);
    expect((await ledger('none', outbound.machineId)).stock).toBe(5);
    const alerts = await openAlerts('inventory_discrepancy');
    expect(alerts.map((a) => a.title)).toContain('Machine reported a dispense Snack Quest never ordered');
  });

  it('through the API: an unknown command is a 404, and nothing moves', async () => {
    const result = await v1(key, machine.machineCode).report('DSP-00000000', { status: 'dispensed', eventId: 'J-unknown' });
    expect(result.status).toBe(404);
    expect((await ledger('none')).stock).toBe(5);
  });
});

describe('K — the payment callback arrives twice', () => {
  it('one payment, one dispense, however the duplicates interleave', async () => {
    const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    const checkoutRequestId = `ws_CO_K_${id}`;
    await adminFirestore.collection('machineTransactions').doc(id).update({ checkoutRequestId });
    const amountKes = (await machineTransactionRepository.findById(BUSINESS_ID, id))!.amountKes;
    const callback = { checkoutRequestId, merchantRequestId: 'm', resultCode: 0, resultDesc: 'ok', amountKes, mpesaReceiptNumber: 'RKTWICE01' };
    const outcomes = await Promise.all([machineTransactionService.handleMpesaCallback(BUSINESS_ID, callback), machineTransactionService.handleMpesaCallback(BUSINESS_ID, callback)]);
    outcomes.push(await machineTransactionService.handleMpesaCallback(BUSINESS_ID, callback));
    expect(outcomes.map((o) => (o as { outcome: string }).outcome).sort()).toEqual(['duplicate', 'duplicate', 'succeeded']);
    expect(await ledger(id)).toMatchObject({ status: 'vend_authorized', commands: 1 });
    expect((await v1(key, machine.machineCode).commands()).data.commands).toHaveLength(1);
  });
});

describe('L — the manufacturer uses the sandbox key against production', () => {
  it('refused before anything is read or written', async () => {
    const production = await activeMachine(BUSINESS_ID, inboundIds, { adapterKey: 'snack_quest_gateway', environment: 'production' });
    const result = await v1(key, production.machineCode).heartbeat({ eventId: 'L-1' });
    expect(result.status).toBe(403);
    expect(result.error?.code).toBe('environment_mismatch');
    expect((await machineIntegrationRepository.findByMachineId(BUSINESS_ID, production.machineId))?.signals.heartbeat).toBeNull();

    await adminFirestore.collection('manufacturers').doc(inboundIds.manufacturerId).update({ onboardingStage: 'production' });
    const productionKey = await apiKey(BUSINESS_ID, inboundIds.manufacturerId, { environment: 'production' });
    expect((await v1(productionKey, machine.machineCode).heartbeat({ eventId: 'L-2' })).error?.code).toBe('environment_mismatch');
  });
});

describe('M — the manufacturer\'s credentials are compromised', () => {
  it('the blast radius is that manufacturer\'s machines — never another manufacturer\'s, never a sale', async () => {
    const otherKey = await apiKey(BUSINESS_ID, outboundIds.manufacturerId);
    const attack = await v1(otherKey, machine.machineCode).heartbeat({ eventId: 'M-1' });
    expect([403, 404]).toContain(attack.status);
    const commands = await v1(otherKey, machine.machineCode).commands();
    expect([403, 404]).toContain(commands.status);
  });

  it('a machine-scoped key speaks for its one machine only', async () => {
    const second = await activeMachine(BUSINESS_ID, inboundIds, { adapterKey: 'snack_quest_gateway' });
    const scoped = await apiKey(BUSINESS_ID, inboundIds.manufacturerId, { machineId: machine.machineId });
    expect((await v1(scoped, machine.machineCode).heartbeat({ eventId: 'M-2' })).status).toBe(202);
    expect([403, 404]).toContain((await v1(scoped, second.machineCode).heartbeat({ eventId: 'M-3' })).status);
  });

  it('revocation cuts the attacker off', async () => {
    await integrationCredentialService.revoke(BUSINESS_ID, key.keyId, 'compromised', 'staff-1');
    expect((await v1(key, machine.machineCode).commands()).status).toBe(401);
  });
});

describe('N — a machine starts sending 100× normal traffic', () => {
  it('it is throttled on that endpoint alone; its dispense reporting and other machines are unaffected', async () => {
    const client = v1(key, machine.machineCode);
    const results = await inParallel(40, 10, (i) => client.heartbeat({ eventId: `hb-N-${i}-${Date.now()}` }));
    const limited = results.filter((r) => r.status === 429);
    expect(limited.length).toBeGreaterThanOrEqual(20);
    expect(limited[0].error?.code).toBe('rate_limited');
    expect(limited[0].headers.get('retry-after')).toBeTruthy();

    const { id, commandRef } = await paidAndQueued();
    expect((await client.report(commandRef, { status: 'dispensed', eventId: `N-${id}` })).status).toBe(200);
    const neighbour = await activeMachine(BUSINESS_ID, inboundIds, { adapterKey: 'snack_quest_gateway' });
    expect((await v1(key, neighbour.machineCode).heartbeat({ eventId: 'N-neighbour' })).status).toBe(202);
  });
});

describe('O — a manufacturer sends malformed JSON continuously', () => {
  it('each is a 400 until the error budget runs out, then 429; other machines are unaffected', async () => {
    const path = `/api/v1/machines/${machine.machineCode}/heartbeat`;
    const statuses: number[] = [];
    for (let i = 0; i < 70; i += 1) {
      const response = await routes.heartbeatRoute(signed(key, path, undefined, { method: 'POST', rawBody: '{"eventId": "broken' }), routes.machine(machine.machineCode));
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(-5).every((s) => s === 429)).toBe(true);
    const neighbour = await activeMachine(BUSINESS_ID, inboundIds, { adapterKey: 'snack_quest_gateway' });
    expect((await v1(key, neighbour.machineCode).heartbeat({ eventId: 'O-neighbour' })).status).toBe(202);
  }, 60_000);
});

describe('P — the machine clock is wrong by 20 minutes', () => {
  it('refused with the server time, so the client can correct its offset and succeed', async () => {
    const drift = -20 * 60;
    const client = v1(key, machine.machineCode);
    const refused = await client.heartbeat({ eventId: 'P-1' }, { timestamp: Math.floor(Date.now() / 1000) + drift });
    expect(refused.status).toBe(401);
    expect(refused.error?.code).toBe('stale_timestamp');
    const serverTimestamp = (refused.error?.details as { serverTimestamp: number }).serverTimestamp;
    expect(Math.abs(serverTimestamp - Date.now() / 1000)).toBeLessThan(5);

    const corrected = await client.heartbeat({ eventId: 'P-2' }, { timestamp: serverTimestamp });
    expect(corrected.status).toBe(202);
  });

  it('a device time 20 minutes off is kept as the machine said it; an absurd one is replaced by receipt time', async () => {
    const client = v1(key, machine.machineCode);
    const skewed = new Date(Date.now() - 20 * 60_000);
    await client.events({ events: [{ eventId: 'P-e1', type: 'DOOR_OPENED', occurredAt: skewed.toISOString() }, { eventId: 'P-e2', type: 'DOOR_CLOSED', occurredAt: '2001-01-01T00:00:00Z' }] });
    const events = await adminFirestore.collection('machineEvents').where('machineId', '==', machine.machineId).where('type', 'in', ['DOOR_OPENED', 'DOOR_CLOSED']).get();
    const byType = Object.fromEntries(events.docs.map((doc) => [doc.get('type'), (doc.get('occurredAt') as Timestamp).toMillis()]));
    expect(Math.abs(byType.DOOR_OPENED - skewed.getTime())).toBeLessThan(1000);
    expect(Date.now() - byType.DOOR_CLOSED).toBeLessThan(60_000);
  });
});

describe('Q — two events share an id but carry different payloads', () => {
  it('generic events: the first stands, the second is reported as a conflict', async () => {
    const client = v1(key, machine.machineCode);
    await client.events({ events: [{ eventId: 'Q-1', type: 'DOOR_OPENED' }] });
    const second = await client.events({ events: [{ eventId: 'Q-1', type: 'MACHINE_ERROR', data: { code: 'E9' } }] });
    expect(second.data).toMatchObject({ recorded: 0, conflictingEventIds: ['Q-1'] });
  });

  it('dispense reports: the reused id is refused, and the money decision stands', async () => {
    const { id, commandRef } = await paidAndQueued();
    const client = v1(key, machine.machineCode);
    await client.report(commandRef, { status: 'dispensed', eventId: `Q-${id}` });
    const reused = await client.report(commandRef, { status: 'failed', eventId: `Q-${id}`, failureCode: 'jam' });
    expect(reused.status).toBe(409);
    expect(reused.error?.code).toBe('idempotency_key_reused');
    expect(await ledger(id)).toMatchObject({ status: 'dispensed', saleMovements: 1, stock: 4 });
  });
});

describe('R — a machine changes firmware', () => {
  it('recorded, and staff are told (a certified model may no longer behave as certified)', async () => {
    const client = v1(key, machine.machineCode);
    await client.connect({ manufacturerMachineId: machine.manufacturerMachineId, firmwareVersion: '1.0.0' });
    await client.connect({ manufacturerMachineId: machine.manufacturerMachineId, firmwareVersion: '2.0.0' });
    expect((await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machine.machineId))?.firmwareVersion).toBe('2.0.0');
    expect((await openAlerts('integration_issue')).map((a) => a.title)).toContain('Machine firmware changed');
    expect((await client.heartbeat({ eventId: `hb-R-${Date.now()}` })).status).toBe(202);
  });
});

describe('S — the manufacturer changes a field unexpectedly', () => {
  it('new fields are ignored, unknown event types are kept, a missing field is a precise 422', async () => {
    const client = v1(key, machine.machineCode);
    expect((await client.heartbeat({ eventId: `hb-S-${Date.now()}`, batteryPercent: 80, newThing: { nested: true } })).status).toBe(202);
    const events = await client.events({ events: [{ eventId: 'S-1', type: 'COIN_BOX_FULL' }] });
    expect(events.data).toMatchObject({ recorded: 1, unknownTypes: ['COIN_BOX_FULL'] });
    const missing = await client.status({ eventId: 'S-2' });
    expect(missing.status).toBe(422);
    expect(JSON.stringify(missing.error?.details)).toContain('online');
  });

  it('a new failure code does not block the refund: recorded as failed, the native code kept', async () => {
    const { id, commandRef } = await paidAndQueued();
    const result = await v1(key, machine.machineCode).report(commandRef, { status: 'failed', eventId: `S-${id}`, failureCode: 'motor_overcurrent' });
    expect(result.status).toBe(200);
    expect(await ledger(id)).toMatchObject({ status: 'paid_vend_failed', saleMovements: 0, stock: 5 });
    expect((await machineTransactionRepository.findById(BUSINESS_ID, id))?.failureReason).toContain('motor_overcurrent');
  });
});

describe('T — a manufacturer disappears entirely', () => {
  it('one manufacturer outage alert, orders refused, queued dispenses refunded, acknowledged ones reviewed — and it clears on return', async () => {
    const fleet = [machine, await activeMachine(BUSINESS_ID, inboundIds, { adapterKey: 'snack_quest_gateway' }), await activeMachine(BUSINESS_ID, inboundIds, { adapterKey: 'snack_quest_gateway' })];
    for (const member of fleet) {
      await v1(key, member.machineCode).heartbeat({ eventId: `hb-T-${member.machineCode}` });
    }
    const queued = await paidAndQueued();
    const acked = await paidAndQueued();
    await v1(key, machine.machineCode).ack(acked.commandRef);

    // Silence.
    for (const member of fleet) {
      await silence(member.machineId, 900);
    }
    await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(queued.id)).update({ expiresAt: ago(60), updatedAt: ago(180) });
    await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(acked.id)).update({ updatedAt: ago(600) });

    const outage = await openAlerts('manufacturer_outage');
    expect(outage).toHaveLength(1);
    expect(outage[0].severity).toBe('critical');
    for (const member of fleet) {
      expect(await machineIntegrationService.dispenseGate(BUSINESS_ID, member.machineId, 'pre_payment')).toMatchObject({ allowed: false });
    }
    await dispenseRecoveryService.sweep(BUSINESS_ID);
    expect(await ledger(queued.id)).toMatchObject({ status: 'paid_vend_failed', saleMovements: 0 });
    expect(await ledger(acked.id)).toMatchObject({ status: 'manual_review', saleMovements: 0 });
    // The other manufacturer's machines are not part of it.
    expect(await machineIntegrationService.dispenseGate(BUSINESS_ID, outbound.machineId, 'pre_payment')).toMatchObject({ allowed: true });

    // They come back.
    for (const member of fleet) {
      await v1(key, member.machineCode).heartbeat({ eventId: `hb-T-back-${member.machineCode}` });
    }
    expect(await openAlerts('manufacturer_outage')).toEqual([]);
  });
});
