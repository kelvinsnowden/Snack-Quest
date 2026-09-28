import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentReference, Query, Transaction, WriteBatch, Firestore } from 'firebase-admin/firestore';
import { machineTransactionService } from '@/services/machineTransactionService';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, v1, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * What one machine request costs in Firestore operations, measured —
 * the basis of the scale model in docs/MACHINE_INTEGRATION_READINESS.md
 * §7. Each request type has a budget; a change that makes the hot path
 * more expensive fails here before it fails in production.
 *
 * Measured with the credential cache and signal throttles in their
 * steady state (the machine has been talking for a while), which is
 * what a fleet sees >99% of the time. The rate limiter is on its
 * in-memory store here; in production it's KV, which is not Firestore.
 */

const BUSINESS_ID = 'biz-request-cost';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY, ttl: process.env.CREDENTIAL_CACHE_TTL_MS };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '6'.repeat(64);
  process.env.CREDENTIAL_CACHE_TTL_MS = '30000';
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
  if (ORIGINAL.ttl === undefined) delete process.env.CREDENTIAL_CACHE_TTL_MS;
  else process.env.CREDENTIAL_CACHE_TTL_MS = ORIGINAL.ttl;
});

const counts = { reads: 0, writes: 0 };
const trail: string[] = [];
const where = (self: unknown) => (self as { path?: string; _queryOptions?: { collectionId?: string } }).path ?? (self as { _queryOptions?: { collectionId?: string } })._queryOptions?.collectionId ?? 'tx/batch';
function instrument() {
  const countRead = (result: unknown) => {
    const docs = (result as { docs?: unknown[] })?.docs;
    counts.reads += docs ? Math.max(1, docs.length) : 1;
    return result;
  };
  for (const method of ['get'] as const) {
    const original = DocumentReference.prototype[method];
    vi.spyOn(DocumentReference.prototype, method).mockImplementation(function (this: DocumentReference, ...args: never[]) {
      trail.push(`R doc ${where(this)}`);
      return (original as (...a: never[]) => Promise<unknown>).apply(this, args).then(countRead);
    } as never);
    const originalQuery = Query.prototype[method];
    vi.spyOn(Query.prototype, method).mockImplementation(function (this: Query, ...args: never[]) {
      trail.push(`R query ${where(this)}`);
      return (originalQuery as (...a: never[]) => Promise<unknown>).apply(this, args).then(countRead);
    } as never);
  }
  const originalTxGet = Transaction.prototype.get;
  vi.spyOn(Transaction.prototype, 'get').mockImplementation(function (this: Transaction, ...args: never[]) {
    trail.push(`R tx ${where(args[0])}`);
    return (originalTxGet as (...a: never[]) => Promise<unknown>).apply(this, args).then(countRead);
  } as never);
  const originalGetAll = Firestore.prototype.getAll;
  vi.spyOn(Firestore.prototype, 'getAll').mockImplementation(function (this: Firestore, ...args: never[]) {
    return (originalGetAll as (...a: never[]) => Promise<unknown[]>).apply(this, args).then((docs) => ((counts.reads += docs.length), docs));
  } as never);
  // Document and transaction writes both go through a WriteBatch internally — count them there, once.
  for (const target of [WriteBatch.prototype] as unknown as Record<string, unknown>[]) {
    for (const method of ['set', 'update', 'create', 'delete']) {
      const original = target[method] as (...a: unknown[]) => unknown;
      (vi.spyOn as unknown as (object: object, name: string) => { mockImplementation(fn: unknown): void })(target, method).mockImplementation(function (this: unknown, ...args: unknown[]) {
        counts.writes += 1;
        trail.push(`W ${method} ${where(args[0] ?? this)}`);
        return original.apply(this, args);
      } as never);
    }
  }
}

let machine: V1Machine;
let key: Key;

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  const ids = await onboardManufacturer(BUSINESS_ID, 'costco', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
  // Steady state: the machine has been talking; caches and throttles are warm.
  const client = v1(key, machine.machineCode);
  await client.heartbeat({ eventId: `hb-warm-${Date.now()}` });
  await client.commands();
});
afterEach(() => vi.restoreAllMocks());

async function measure(action: () => Promise<unknown>) {
  counts.reads = 0;
  counts.writes = 0;
  trail.length = 0;
  instrument();
  await action();
  vi.restoreAllMocks();
  console.log('TRAIL', JSON.stringify(trail));
  return { ...counts };
}

describe('Firestore cost per machine request (steady state)', () => {
  const budgets: Record<string, { reads: number; writes: number }> = {
    'idle command poll': { reads: 3, writes: 1 },
    heartbeat: { reads: 4, writes: 1 },
  };
  const results: Record<string, { reads: number; writes: number }> = {};

  it('idle command poll', async () => {
    results['idle command poll'] = await measure(() => v1(key, machine.machineCode).commands());
    expect(results['idle command poll'].reads).toBeLessThanOrEqual(budgets['idle command poll'].reads);
    expect(results['idle command poll'].writes).toBeLessThanOrEqual(budgets['idle command poll'].writes);
  });

  it('heartbeat', async () => {
    results.heartbeat = await measure(() => v1(key, machine.machineCode).heartbeat({ eventId: `hb-${Date.now()}` }));
    expect(results.heartbeat.reads).toBeLessThanOrEqual(budgets.heartbeat.reads);
    expect(results.heartbeat.writes).toBeLessThanOrEqual(budgets.heartbeat.writes);
  });

  it('a complete sale (payment verified → dispatch → poll → ack → dispensed)', async () => {
    const cost = await measure(async () => {
      const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
      await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, 'RCOST00001');
      await machineTransactionService.authorizeVend(BUSINESS_ID, id);
      const command = await machineDispenseCommandRepository.findByTransactionId(BUSINESS_ID, id);
      const client = v1(key, machine.machineCode);
      await client.commands();
      await client.ack(command!.commandRef);
      await client.report(command!.commandRef, { status: 'dispensed', eventId: `cost-${id}` });
    });
    results.sale = cost;
    // Recorded for the scale model; bounded loosely — a sale is rare next to polls.
    expect(cost.reads).toBeLessThan(80);
    expect(cost.writes).toBeLessThan(40);
    console.log('REQUEST_COST', JSON.stringify(results));
  });
});
