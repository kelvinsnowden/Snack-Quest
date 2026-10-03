import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { claimRequestNonce } from '@/lib/vending/integrationAuth';
import { setSharedKvForTesting, type KvClient } from '@/lib/kv/upstashRestClient';
import { MAX_TIMESTAMP_SKEW_SECONDS } from '@/lib/vending/requestSigning';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, routes, signed, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * Replay protection under concurrency. A nonce is claimed with an atomic
 * create-if-absent, so when the same signed request arrives many times
 * at once — a retry storm, or an attacker racing the original — exactly
 * one copy is acted on. Checked on both nonce stores and end to end.
 */

/** A Redis stand-in with Redis's own semantics: commands run one at a time, SET NX succeeds once. */
function fakeRedis(): KvClient & { keys: Map<string, number> } {
  const keys = new Map<string, number>();
  let queue = Promise.resolve();
  const client = {
    keys,
    async pipeline(commands: (string | number)[][]) {
      const run = queue.then(async () => {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
        return commands.map(([op, key, , nx, , ttl]) => {
          if (op !== 'SET') throw new Error(`unexpected ${op}`);
          if (nx === 'NX' && keys.has(String(key))) return null;
          keys.set(String(key), Number(ttl));
          return 'OK';
        });
      });
      queue = run.then(() => undefined, () => undefined);
      return run;
    },
  };
  return client as unknown as KvClient & { keys: Map<string, number> };
}

const now = () => Math.floor(Date.now() / 1000);
const nonceOf = () => `n-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

afterEach(() => {
  delete process.env.MACHINE_API_NONCE_STORE;
  setSharedKvForTesting(undefined);
});

describe('nonce stores', () => {
  it('Firestore: 25 concurrent claims of one nonce — exactly one wins', async () => {
    const nonce = nonceOf();
    const results = await Promise.all(Array.from({ length: 25 }, () => claimRequestNonce('key-a', nonce, now())));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('the same nonce under two different keys is two different claims', async () => {
    const nonce = nonceOf();
    expect(await claimRequestNonce('key-a', nonce, now())).toBe(true);
    expect(await claimRequestNonce('key-b', nonce, now())).toBe(true);
    expect(await claimRequestNonce('key-a', nonce, now())).toBe(false);
  });

  it('claims expire by TTL after the timestamp window closes (configured in firestore.indexes.json)', async () => {
    const nonce = nonceOf();
    const timestamp = now();
    await claimRequestNonce('key-ttl', nonce, timestamp);
    const docs = (await adminFirestore.collection('integrationRequestNonces').where('keyId', '==', 'key-ttl').get()).docs;
    expect(docs).toHaveLength(1);
    expect(docs[0].get('expiresAt').toMillis()).toBe((timestamp + MAX_TIMESTAMP_SKEW_SECONDS * 2) * 1000);
    const indexes = (await import('../../firestore.indexes.json')).default as { fieldOverrides: { collectionGroup: string; fieldPath: string; ttl?: boolean }[] };
    expect(indexes.fieldOverrides.some((o) => o.collectionGroup === 'integrationRequestNonces' && o.fieldPath === 'expiresAt' && o.ttl)).toBe(true);
  });

  it('KV: 25 concurrent claims — exactly one wins, with a TTL', async () => {
    const redis = fakeRedis();
    setSharedKvForTesting(redis);
    process.env.MACHINE_API_NONCE_STORE = 'kv';
    const nonce = nonceOf();
    const results = await Promise.all(Array.from({ length: 25 }, () => claimRequestNonce('key-a', nonce, now())));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect([...redis.keys.values()][0]).toBeGreaterThanOrEqual(60);
  });

  it('KV unreachable: claims fall back to Firestore — replay protection never switches off', async () => {
    setSharedKvForTesting({ pipeline: async () => { throw new Error('KV down'); } } as unknown as KvClient);
    process.env.MACHINE_API_NONCE_STORE = 'kv';
    const nonce = nonceOf();
    const results = await Promise.all(Array.from({ length: 10 }, () => claimRequestNonce('key-a', nonce, now())));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

const BUSINESS_ID = 'biz-nonce-concurrency';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '9'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

describe('end to end through the Machine API', () => {
  let machine: V1Machine;
  let key: Key;
  beforeEach(async () => {
    resetRateLimiterForTesting();
    await clearIntegrationCollections(BUSINESS_ID);
    const ids = await onboardManufacturer(BUSINESS_ID, 'nonceco');
    machine = await activeMachine(BUSINESS_ID, ids);
    key = await apiKey(BUSINESS_ID, ids.manufacturerId);
  });

  it('ten copies of one signed request sent at once: one is accepted, nine are replays', async () => {
    const path = `/api/v1/machines/${machine.machineCode}/heartbeat`;
    const body = { eventId: `hb-${Date.now()}` };
    const nonce = nonceOf();
    const timestamp = now();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => routes.heartbeatRoute(signed(key, path, body, { nonce, timestamp }), routes.machine(machine.machineCode))),
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 202)).toHaveLength(1);
    expect(statuses.filter((s) => s === 401)).toHaveLength(9);
    const codes = await Promise.all(responses.filter((r) => r.status === 401).map(async (r) => (await r.json()).error.code));
    expect(new Set(codes)).toEqual(new Set(['replayed_request']));
  });

  it('a request that fails authentication cannot burn the nonce of the genuine one', async () => {
    const path = `/api/v1/machines/${machine.machineCode}/heartbeat`;
    const body = { eventId: `hb-${Date.now()}` };
    const nonce = nonceOf();
    const timestamp = now();
    const forged = await routes.heartbeatRoute(signed({ keyId: key.keyId, secret: 'sqs_wrong' }, path, body, { nonce, timestamp }), routes.machine(machine.machineCode));
    expect(forged.status).toBe(401);
    const genuine = await routes.heartbeatRoute(signed(key, path, body, { nonce, timestamp }), routes.machine(machine.machineCode));
    expect(genuine.status).toBe(202);
  });

  it('a request outside the timestamp window is refused before its nonce is claimed', async () => {
    const path = `/api/v1/machines/${machine.machineCode}/heartbeat`;
    const nonce = nonceOf();
    const stale = await routes.heartbeatRoute(signed(key, path, { eventId: 'old' }, { nonce, timestamp: now() - MAX_TIMESTAMP_SKEW_SECONDS - 5 }), routes.machine(machine.machineCode));
    expect(stale.status).toBe(401);
    expect((await stale.json()).error.code).toBe('stale_timestamp');
    expect((await routes.heartbeatRoute(signed(key, path, { eventId: 'fresh' }, { nonce }), routes.machine(machine.machineCode))).status).toBe(202);
  });
});
