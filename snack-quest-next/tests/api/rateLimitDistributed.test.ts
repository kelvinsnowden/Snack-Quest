import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { FallbackRateLimitStore, FirestoreRateLimitStore, KvRateLimitStore, RateLimiter, resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import type { KvClient } from '@/lib/kv/upstashRestClient';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, routes, signed, v1, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * Rate limiting in a multi-instance deployment. Every serverless
 * instance has its own memory, so a limit is only real if the counter
 * lives outside the process: these tests run two independent limiters
 * (two "instances") against the same Firestore store and prove they
 * share one budget — including when KV is down.
 */

const rule = (limit: number) => ({ name: 'test.rule', limit, windowSeconds: 60 });
const uniqueKey = () => `test:${Math.random().toString(36).slice(2)}`;

describe('shared counters (no per-process state)', () => {
  it('two instances share one budget', async () => {
    const key = uniqueKey();
    const instanceA = new RateLimiter(new FirestoreRateLimitStore('rl-test'));
    const instanceB = new RateLimiter(new FirestoreRateLimitStore('rl-test'));
    const now = Date.now();
    const decisions = [];
    for (let i = 0; i < 6; i += 1) {
      decisions.push(await (i % 2 === 0 ? instanceA : instanceB).check([{ key, rule: rule(5) }], now));
    }
    expect(decisions.map((d) => d.allowed)).toEqual([true, true, true, true, true, false]);
  });

  it('concurrent requests can never be let through beyond the limit', async () => {
    const key = uniqueKey();
    const limiter = new RateLimiter(new FirestoreRateLimitStore('rl-test'));
    const now = Date.now();
    const decisions = await Promise.all(Array.from({ length: 25 }, () => limiter.check([{ key, rule: rule(10) }], now)));
    const allowedInBurst = decisions.filter((d) => d.allowed).length;
    expect(allowedInBurst).toBeLessThanOrEqual(10);
    // The burst didn't use up the window: requests that follow fill it to exactly the limit, no further.
    let allowedAfter = 0;
    for (let i = 0; i < 15; i += 1) {
      if ((await limiter.check([{ key, rule: rule(10) }], now)).allowed) allowedAfter += 1;
    }
    expect(allowedInBurst + allowedAfter).toBe(10);
  }, 30_000);

  it('the budget resets with the window', async () => {
    const key = uniqueKey();
    const limiter = new RateLimiter(new FirestoreRateLimitStore('rl-test'));
    const now = Date.now();
    for (let i = 0; i < 3; i += 1) await limiter.check([{ key, rule: rule(3) }], now);
    expect((await limiter.check([{ key, rule: rule(3) }], now)).allowed).toBe(false);
    expect((await limiter.check([{ key, rule: rule(3) }], now + 61_000)).allowed).toBe(true);
  });

  it('a high-volume key is spread over several counter documents, and still limits', async () => {
    const key = uniqueKey();
    const store = new FirestoreRateLimitStore('rl-shard', 10, 4);
    const limiter = new RateLimiter(store);
    const now = Date.now();
    const results: boolean[] = [];
    for (let i = 0; i < 80; i += 1) {
      results.push((await limiter.check([{ key, rule: rule(40) }], now)).allowed);
    }
    const allowed = results.filter(Boolean).length;
    expect(allowed).toBeGreaterThanOrEqual(20);
    expect(allowed).toBeLessThanOrEqual(60);
    expect(results.slice(-10).every((allowedHere) => !allowedHere)).toBe(true);
    const shardDocs = (await adminFirestore.collection('rateLimitCounters').get()).docs.filter((doc) => typeof doc.get('count') === 'number');
    expect(shardDocs.length).toBeGreaterThan(1);
  });

  it('a KV outage falls back to the shared Firestore store — never to per-instance counters', async () => {
    const broken: KvClient = { pipeline: async () => { throw new Error('KV down'); } } as unknown as KvClient;
    const key = uniqueKey();
    const instanceA = new RateLimiter(new FallbackRateLimitStore(new KvRateLimitStore(broken), new FirestoreRateLimitStore('rl-test')));
    const instanceB = new RateLimiter(new FallbackRateLimitStore(new KvRateLimitStore(broken), new FirestoreRateLimitStore('rl-test')));
    const now = Date.now();
    await instanceA.check([{ key, rule: rule(2) }], now);
    await instanceB.check([{ key, rule: rule(2) }], now);
    expect((await instanceA.check([{ key, rule: rule(2) }], now)).allowed).toBe(false);
  });
});

const BUSINESS_ID = 'biz-rate-limit-distributed';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY, limits: process.env.MACHINE_API_RATE_LIMITS };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '5'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
  if (ORIGINAL.limits === undefined) delete process.env.MACHINE_API_RATE_LIMITS;
  else process.env.MACHINE_API_RATE_LIMITS = ORIGINAL.limits;
});

let ids: { manufacturerId: string; modelId: string };
let machineA: V1Machine;
let machineB: V1Machine;
let key: Key;

beforeEach(async () => {
  delete process.env.MACHINE_API_RATE_LIMITS;
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  ids = await onboardManufacturer(BUSINESS_ID, 'rlco', { adapterKey: 'snack_quest_gateway' });
  machineA = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  machineB = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
});

describe('the Machine API under load', () => {
  it('legitimate high-frequency traffic is never limited (a poll every 2 s, a heartbeat a minute, for a minute)', async () => {
    const client = v1(key, machineA.machineCode);
    const polls = [];
    for (let i = 0; i < 30; i += 1) {
      polls.push(await client.commands());
    }
    expect(polls.every((poll) => poll.status === 200)).toBe(true);
    expect((await client.heartbeat({ eventId: `hb-${Date.now()}` })).status).toBe(202);
    expect(Number(polls[0].headers.get('sq-ratelimit-limit'))).toBeGreaterThan(0);
  }, 60_000);

  it('one machine flooding does not affect another machine of the same manufacturer', async () => {
    const flooding = await Promise.all(Array.from({ length: 20 }, (_, i) => v1(key, machineA.machineCode).heartbeat({ eventId: `flood-${i}-${Date.now()}` })));
    expect(flooding.filter((r) => r.status === 202).length).toBeLessThanOrEqual(12);
    expect(flooding.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(8);
    expect((await v1(key, machineB.machineCode).heartbeat({ eventId: `calm-${Date.now()}` })).status).toBe(202);
  }, 60_000);

  it('a manufacturer-wide ceiling contains many keys misbehaving together', async () => {
    process.env.MACHINE_API_RATE_LIMITS = JSON.stringify({ perManufacturerPerMinute: 5 });
    const second = await apiKey(BUSINESS_ID, ids.manufacturerId);
    const results = [];
    for (let i = 0; i < 6; i += 1) {
      results.push(await v1(i % 2 ? second : key, i % 2 ? machineB.machineCode : machineA.machineCode).commands());
    }
    expect(results.slice(0, 5).every((r) => r.status === 200)).toBe(true);
    expect(results[5]).toMatchObject({ status: 429, error: { code: 'rate_limited' } });
    expect(results[5].error?.details ?? results[5].headers.get('sq-ratelimit-policy')).toBeTruthy();
    expect(results[5].headers.get('sq-ratelimit-policy')).toBe('manufacturer.requests');
  });

  it('replaying a captured request does not spend the machine\'s budget', async () => {
    const path = `/api/v1/machines/${machineA.machineCode}/heartbeat`;
    const captured = { eventId: `captured-${Date.now()}` };
    const nonce = 'captured-nonce-0000000001';
    const statuses: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const response = await routes.heartbeatRoute(signed(key, path, captured, { nonce }), routes.machine(machineA.machineCode));
      statuses.push(response.status);
    }
    expect(statuses[0]).toBe(202);
    expect(statuses.slice(1).every((status) => status === 401)).toBe(true);
    // 19 replays, and the real machine's heartbeat budget (12/min) is untouched.
    expect((await v1(key, machineA.machineCode).heartbeat({ eventId: `real-${Date.now()}` })).status).toBe(202);
  });

  it('forged requests from one address are cut off for that address only', async () => {
    process.env.MACHINE_API_RATE_LIMITS = JSON.stringify({ authFailuresPerIpPerMinute: 20 });
    // Fixed windows: start well inside one so the run can't straddle a reset.
    const intoWindow = (Date.now() / 1000) % 60;
    if (intoWindow > 45) await new Promise((resolve) => setTimeout(resolve, (61 - intoWindow) * 1000));
    const forger = { keyId: key.keyId, secret: 'sqs_not_the_real_secret' };
    const path = `/api/v1/machines/${machineA.machineCode}/heartbeat`;
    const statuses: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      const response = await routes.heartbeatRoute(signed(forger, path, { eventId: `f-${i}` }, { ip: '203.0.113.7' }), routes.machine(machineA.machineCode));
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 20).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(21).every((status) => status === 429)).toBe(true);
    expect((await v1(key, machineA.machineCode).heartbeat({ eventId: `ok-${Date.now()}` }, { ip: '198.51.100.9' })).status).toBe(202);
  }, 60_000);
});
