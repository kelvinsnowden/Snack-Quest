import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineTransactionService } from '@/services/machineTransactionService';
import { dispenseRecoveryService } from '@/services/dispenseRecoveryService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { parseDeviceTime, resolveOccurredAt } from '@/lib/vending/machineEvents';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { dispenseCommandDocId } from '@/types';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, v1, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * What a polling machine sees when real life happens to it: it loses
 * its connection, restarts mid-dispense, loses power, comes back twelve
 * hours later, receives a command twice or reports out of order, or
 * runs with a wrong clock. The rule throughout: the server decides
 * whether a command may still run (at the acknowledgement), and a
 * command can never be executed twice through the API.
 */

const BUSINESS_ID = 'biz-command-polling';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = 'f'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let machine: V1Machine;
let key: Key;
const ago = (ms: number) => Timestamp.fromMillis(Date.now() - ms);

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  const ids = await onboardManufacturer(BUSINESS_ID, 'pollco', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
  await v1(key, machine.machineCode).heartbeat({ eventId: `hb-${Date.now()}` });
});

async function queued(): Promise<{ id: string; commandRef: string }> {
  const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, `R${id.slice(0, 8)}`);
  await machineTransactionService.authorizeVend(BUSINESS_ID, id);
  return { id, commandRef: (await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id))!.commandRef };
}
const moneyOf = async (id: string) => (await machineTransactionRepository.findById(BUSINESS_ID, id))?.status;

describe('a machine that was away', () => {
  it('back after 12 hours: the expired dispense is not offered, cannot be acknowledged, and the customer was refunded', async () => {
    const { id, commandRef } = await queued();
    await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)).update({ expiresAt: ago(12 * 3600_000), createdAt: ago(12 * 3600_000 + 120_000), updatedAt: ago(12 * 3600_000) });
    await dispenseRecoveryService.sweep(BUSINESS_ID);
    expect(await moneyOf(id)).toBe('paid_vend_failed');

    const client = v1(key, machine.machineCode);
    const poll = await client.commands();
    expect(poll.data.commands.map((c) => c.commandId)).not.toContain(commandRef);
    const ack = await client.ack(commandRef);
    expect(ack.status).toBe(409);
    expect(ack.error?.code).toBe('command_expired');
  });

  it('lost connection before collecting: the command waits in the queue until it expires, then is refused', async () => {
    const { commandRef, id } = await queued();
    const client = v1(key, machine.machineCode);
    expect((await client.commands()).data.commands.map((c) => c.commandId)).toContain(commandRef);
    await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)).update({ expiresAt: ago(1000) });
    expect((await client.commands()).data.commands.map((c) => c.commandId)).not.toContain(commandRef);
    expect((await client.ack(commandRef)).error?.code).toBe('command_expired');
  });
});

describe('restarts and power loss', () => {
  it('restart after acknowledging (mid-dispense): the command is not offered again; the heartbeat asks for its outcome', async () => {
    const { commandRef, id } = await queued();
    const client = v1(key, machine.machineCode);
    expect((await client.ack(commandRef)).status).toBe(200);
    // The machine reboots and polls with no memory of the command.
    expect((await client.commands()).data.commands.map((c) => c.commandId)).not.toContain(commandRef);
    // Once it has been in flight longer than any real dispense takes, every heartbeat asks for the outcome.
    await adminFirestore.collection('machineDispenseCommands').doc(dispenseCommandDocId(id)).update({ updatedAt: ago(5 * 60_000) });
    const beat = await client.heartbeat({ eventId: `hb-after-restart-${Date.now()}` });
    expect((beat.data as { reportOutcomes?: { commandId: string }[] }).reportOutcomes?.map((r) => r.commandId)).toContain(commandRef);
  });

  it('power lost before acknowledging: the command is simply offered again (nothing ran)', async () => {
    const { commandRef } = await queued();
    const client = v1(key, machine.machineCode);
    expect((await client.commands()).data.commands.map((c) => c.commandId)).toContain(commandRef);
    expect((await client.commands()).data.commands.map((c) => c.commandId)).toContain(commandRef);
  });
});

describe('duplicate and out-of-order delivery', () => {
  it('the same command polled twice has the same commandId; acknowledging twice is harmless; after the outcome it cannot be acknowledged again', async () => {
    const { commandRef, id } = await queued();
    const client = v1(key, machine.machineCode);
    const [a, b] = [await client.commands(), await client.commands()];
    expect(a.data.commands[0].commandId).toBe(b.data.commands[0].commandId);
    expect((await client.ack(commandRef)).status).toBe(200);
    expect((await client.ack(commandRef)).status).toBe(200);
    await client.report(commandRef, { status: 'dispensed', eventId: `out-${id}` });
    const late = await client.ack(commandRef);
    expect(late.status).toBe(409);
    expect(late.error?.code).toBe('invalid_command_state');
    expect(await moneyOf(id)).toBe('dispensed');
  });

  it('"dispensing" arriving after "dispensed" changes nothing', async () => {
    const { commandRef, id } = await queued();
    const client = v1(key, machine.machineCode);
    await client.ack(commandRef);
    await client.report(commandRef, { status: 'dispensed', eventId: `end-${id}` });
    const stale = await client.report(commandRef, { status: 'dispensing', eventId: `start-${id}` });
    expect(stale.status).toBe(200);
    expect(await moneyOf(id)).toBe('dispensed');
  });
});

describe('clocks', () => {
  it('every poll carries the server time, so a machine with a wrong clock can judge expiresAt', async () => {
    const poll = await v1(key, machine.machineCode).commands();
    const serverTime = Date.parse(poll.data.serverTime ?? '');
    expect(Math.abs(serverTime - Date.now())).toBeLessThan(5000);
  });

  it('a request signed 20 minutes off is refused with the server time; corrected, it succeeds', async () => {
    const client = v1(key, machine.machineCode);
    const skewed = await client.heartbeat({ eventId: `hb-skew-${Date.now()}` }, { timestamp: Math.floor(Date.now() / 1000) - 20 * 60 });
    expect(skewed.error?.code).toBe('stale_timestamp');
    const serverTimestamp = (skewed.error?.details as { serverTimestamp: number }).serverTimestamp;
    expect((await client.heartbeat({ eventId: `hb-fixed-${Date.now()}` }, { timestamp: serverTimestamp })).status).toBe(202);
  });

  it('a timestamp without an offset is never guessed: the receipt time is used', async () => {
    expect(parseDeviceTime('2026-09-28T10:00:00')).toBeNull();
    expect(parseDeviceTime('2026-09-28')).toBeNull();
    expect(parseDeviceTime('1759053600')).toBeNull();
    expect(parseDeviceTime('2026-09-28T10:00:00Z')?.toISOString()).toBe('2026-09-28T10:00:00.000Z');
    expect(parseDeviceTime('2026-09-28T13:00:00+03:00')?.toISOString()).toBe('2026-09-28T10:00:00.000Z');
    const received = new Date();
    const local = new Date(received.getTime() - 60_000);
    const naive = local.toISOString().replace('Z', '');
    expect(resolveOccurredAt(naive, received)).toBe(received);
    expect(resolveOccurredAt(local.toISOString(), received).getTime()).toBe(local.getTime());

    const client = v1(key, machine.machineCode);
    await client.events({ events: [{ eventId: `naive-${Date.now()}`, type: 'DOOR_OPENED', occurredAt: naive }] });
    const [event] = (await adminFirestore.collection('machineEvents').where('machineId', '==', machine.machineId).where('type', '==', 'DOOR_OPENED').get()).docs.map((doc) => doc.data());
    expect(Math.abs(event.occurredAt.toMillis() - Date.now())).toBeLessThan(10_000);
  });
});
