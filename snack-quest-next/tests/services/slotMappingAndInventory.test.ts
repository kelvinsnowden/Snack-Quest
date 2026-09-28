import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { MachineSlotService, SlotMappingError } from '@/services/machineSlotService';
import { machineInventorySyncService } from '@/services/machineInventorySyncService';
import { slotMappingHistoryRepository } from '@/repositories/slotMappingHistoryRepository';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, mockHardware, onboardManufacturer, v1, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * Slot mapping keeps its history, slot configuration is validated, and
 * inventory reports are compared against the ledger only when they can
 * be — a delayed or reordered report never raises a false mismatch.
 */

const BUSINESS_ID = 'biz-slot-mapping-inventory';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '1'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let machine: V1Machine;
let key: Key;
const slots = new MachineSlotService(() => mockHardware);
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  const ids = await onboardManufacturer(BUSINESS_ID, 'slotco', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  for (const slotCode of ['A02', 'B01']) mockHardware.seedSlot(machine.machineId, slotCode, { quantity: 0 });
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
});

describe('slot mapping history', () => {
  it('every real change is appended with who and when; unchanged entries and history are never rewritten', async () => {
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId: machine.machineId, slotCode: 'A02', productId: 'pkg-2', productCatalogue: 'package', priceKes: 120, capacity: 8, position: 2 });
    await slots.setSlotMappings(BUSINESS_ID, machine.machineId, [{ slotCode: 'A02', manufacturerSlotId: 'spiral_02' }], 'staff-a');
    await slots.setSlotMappings(BUSINESS_ID, machine.machineId, [{ slotCode: 'A01', manufacturerSlotId: 'spiral_01' }, { slotCode: 'A02', manufacturerSlotId: 'spiral_09' }], 'staff-b');
    const history = await slotMappingHistoryRepository.listForMachine(BUSINESS_ID, machine.machineId);
    const a02 = history.filter((h) => h.slotCode === 'A02').map(({ from, to, changedBy }) => ({ from, to, changedBy }));
    expect(a02).toEqual([
      { from: 'spiral_02', to: 'spiral_09', changedBy: 'staff-b' },
      { from: null, to: 'spiral_02', changedBy: 'staff-a' },
    ]);
    // A01 was already spiral_01 (set by the fixture): no entry for the no-op.
    expect(history.filter((h) => h.slotCode === 'A01' && h.changedBy === 'staff-b')).toEqual([]);
  });

  it('a mapping that would give two slots the same manufacturer id is refused, and nothing (history included) is written', async () => {
    await slots.configureSlot({ businessId: BUSINESS_ID, machineId: machine.machineId, slotCode: 'A02', productId: 'pkg-2', productCatalogue: 'package', priceKes: 120, capacity: 8, position: 2 });
    const before = (await slotMappingHistoryRepository.listForMachine(BUSINESS_ID, machine.machineId)).length;
    await expect(slots.setSlotMappings(BUSINESS_ID, machine.machineId, [{ slotCode: 'A02', manufacturerSlotId: 'spiral_01' }], 'staff-a')).rejects.toBeInstanceOf(SlotMappingError);
    expect((await slotMappingHistoryRepository.listForMachine(BUSINESS_ID, machine.machineId)).length).toBe(before);
  });

  it('a dispense already sent keeps the manufacturer slot it was sent to, whatever the mapping becomes', async () => {
    const { machineTransactionService } = await import('@/services/machineTransactionService');
    const { machineDispenseCommandRepository } = await import('@/repositories/machineDispenseCommandRepository');
    await v1(key, machine.machineCode).heartbeat({ eventId: `hb-${Date.now()}` });
    const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
    await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, 'RMAP1');
    await machineTransactionService.authorizeVend(BUSINESS_ID, id);
    await slots.setSlotMappings(BUSINESS_ID, machine.machineId, [{ slotCode: 'A01', manufacturerSlotId: 'spiral_77' }], 'staff-a');
    expect((await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id))?.manufacturerSlotId).toBe('spiral_01');
    const poll = await v1(key, machine.machineCode).commands();
    expect(poll.data.commands.find((c) => c.type === 'dispense')?.slotId).toBe('spiral_01');
  });
});

describe('slot configuration validation', () => {
  const base = { businessId: BUSINESS_ID, slotCode: 'B01', productId: 'pkg-3', productCatalogue: 'package' as const, priceKes: 100, capacity: 10, position: 1 };
  it.each([
    ['a negative price', { priceKes: -1 }],
    ['a fractional price', { priceKes: 99.5 }],
    ['a product with a zero price', { priceKes: 0 }],
    ['a product without a catalogue', { productCatalogue: null }],
    ['a negative capacity', { capacity: -2 }],
    ['an absurd capacity', { capacity: 100_000 }],
    ['a malformed slot code', { slotCode: 'A 01/../x' }],
  ])('refuses %s', async (_label, change) => {
    await expect(slots.configureSlot({ ...base, machineId: machine.machineId, ...change })).rejects.toBeInstanceOf(SlotMappingError);
  });

  it('accepts an empty slot at price 0, and refuses a fractional price change', async () => {
    await slots.configureSlot({ ...base, machineId: machine.machineId, productId: null, productCatalogue: null, priceKes: 0 });
    await expect(slots.setPrice(BUSINESS_ID, machine.machineId, 'A01', 10.25)).rejects.toBeInstanceOf(SlotMappingError);
  });
});

describe('inventory reports', () => {
  const report = (quantity: number, occurredAt: string | null, reportId: string) =>
    machineInventorySyncService.sync({ businessId: BUSINESS_ID, machineId: machine.machineId, reports: [{ manufacturerSlotId: 'spiral_01', quantity }], reportId, source: 'v1_api', deviceTimestamp: occurredAt });

  it('agreeing counts: no mismatch', async () => {
    expect(await report(5, iso(1000), 'r-ok')).toMatchObject({ stale: false, mismatches: [] });
  });

  it('a count above what the slot can hold is flagged as impossible (sensor or mapping fault), not as an ordinary difference', async () => {
    const capacity = (await adminFirestore.collection('machineSlots').doc(`${machine.machineId}__A01`).get()).get('capacity') as number;
    await report(capacity + 50, iso(1000), 'r-impossible');
    const events = await adminFirestore.collection('machineEvents').where('machineId', '==', machine.machineId).where('type', '==', 'INVENTORY_MISMATCH').get();
    expect(events.docs.map((doc) => doc.get('data.reason'))).toContain('exceeds_capacity');
  });

  it('a report listing the same slot twice is refused (422) — two counts for one slot cannot both be true', async () => {
    const result = await v1(key, machine.machineCode).inventory({ reportId: 'r-dup-slot', slots: [{ slotId: 'spiral_01', quantity: 5 }, { slotId: 'spiral_01', quantity: 2 }] });
    expect(result.status).toBe(422);
    expect(result.error?.code).toBe('validation_failed');
  });

  it('a disagreeing count is a mismatch, never written to the ledger', async () => {
    expect((await report(3, iso(1000), 'r-diff')).mismatches).toEqual([{ slotCode: 'A01', expected: 5, reported: 3 }]);
    expect((await adminFirestore.collection('machineSlots').doc(`${machine.machineId}__A01`).get()).get('currentQuantity')).toBe(5);
  });

  it('an older report arriving after a newer one is stale: recorded, not compared', async () => {
    await report(5, iso(1_000), 'r-new');
    const late = await report(2, iso(60_000), 'r-old');
    expect(late).toMatchObject({ stale: true, mismatches: [] });
  });

  it('a count taken before the ledger last moved the slot (a sale or restock since) is not flagged', async () => {
    // A restock recorded now, by the ledger.
    await adminFirestore.collection('machineSlots').doc(`${machine.machineId}__A01`).update({ currentQuantity: 10, stockChangedAt: Timestamp.now() });
    const beforeRestock = await report(5, iso(30_000), 'r-pre-restock');
    expect(beforeRestock).toMatchObject({ stale: false, mismatches: [], supersededSlots: ['A01'] });
  });

  it('after a reboot with no clock (no occurredAt), the receipt time is used and the count is compared', async () => {
    expect((await report(4, null, 'r-reboot')).mismatches).toHaveLength(1);
  });

  it('unmapped slots (a remap on the machine not yet mirrored) are listed, never guessed', async () => {
    const result = await machineInventorySyncService.sync({ businessId: BUSINESS_ID, machineId: machine.machineId, reports: [{ manufacturerSlotId: 'spiral_404', quantity: 3 }], reportId: 'r-unmapped', source: 'v1_api' });
    expect(result.unmappedSlots).toEqual(['spiral_404']);
  });

  it('through the API: the stale flag is returned to the machine', async () => {
    const client = v1(key, machine.machineCode);
    await client.inventory({ reportId: 'api-new', occurredAt: iso(1000), slots: [{ slotId: 'spiral_01', quantity: 5 }] });
    const late = await client.inventory({ reportId: 'api-old', occurredAt: iso(120_000), slots: [{ slotId: 'spiral_01', quantity: 1 }] });
    expect(late.data).toMatchObject({ stale: true, mismatches: [] });
  });
});
