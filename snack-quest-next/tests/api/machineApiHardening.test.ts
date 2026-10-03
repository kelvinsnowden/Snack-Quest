import { withinOneWindow } from '../helpers/rateLimitWindow';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { integrationCredentialService, CredentialRotationConflictError } from '@/services/integrationCredentialService';
import { integrationCredentialRepository } from '@/repositories/integrationCredentialRepository';
import { machineApiService } from '@/services/machineApiService';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { invalidateCredentialCache } from '@/lib/vending/credentialCache';
import { captureLogs } from '@/lib/observability/logger';
import { signRequest } from '@/lib/vending/requestSigning';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, routes, signed, v1, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * The v1 request pipeline under attack and under load: signing edge
 * cases, credential lifecycle (rotation without downtime, machine
 * scoping, revocation), rate limiting and abuse isolation, and the
 * error envelope. Each test states the property it protects.
 */

const BUSINESS_ID = 'biz-machine-api-hardening';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY, limits: process.env.MACHINE_API_RATE_LIMITS };

beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = 'b'.repeat(64);
});

afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
  if (ORIGINAL.limits === undefined) delete process.env.MACHINE_API_RATE_LIMITS;
  else process.env.MACHINE_API_RATE_LIMITS = ORIGINAL.limits;
});

let ids: { manufacturerId: string; modelId: string };
let machine: V1Machine;
let key: Key;

beforeEach(async () => {
  resetRateLimiterForTesting();
  invalidateCredentialCache();
  delete process.env.MACHINE_API_RATE_LIMITS;
  await clearIntegrationCollections(BUSINESS_ID);
  ids = await onboardManufacturer(BUSINESS_ID, 'hardening');
  machine = await activeMachine(BUSINESS_ID, ids);
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
});

afterEach(() => {
  vi.restoreAllMocks();
});

let seq = 0;
const eventId = () => `ev-${Date.now()}-${(seq += 1)}`;

describe('signing edge cases', () => {
  it('reproduces every published cross-language test vector exactly', () => {
    const file = JSON.parse(readFileSync('docs/machine-api/signing-test-vectors.json', 'utf8')) as {
      secret: string;
      vectors: { method: string; pathWithQuery: string; timestamp: string; nonce: string; bodyUtf8Hex: string; signatureHeader: string }[];
    };
    expect(file.vectors.length).toBeGreaterThanOrEqual(7);
    for (const vector of file.vectors) {
      const headers = signRequest({
        keyId: 'sqk_test_vectorkey',
        secret: file.secret,
        method: vector.method,
        pathWithQuery: vector.pathWithQuery,
        body: Buffer.from(vector.bodyUtf8Hex, 'hex'),
        timestamp: Number(vector.timestamp),
        nonce: vector.nonce,
      });
      expect(headers['x-sq-signature']).toBe(vector.signatureHeader);
    }
  });

  it('verifies non-ASCII bodies over their exact bytes', async () => {
    const result = await v1(key, machine.machineCode).events({ events: [{ eventId: eventId(), type: 'DOOR_OPENED', data: { note: 'Karibu ☕🍫 — Tür offen' } }] });
    expect(result.status).toBe(202);
  });

  it('accepts an uppercase-hex signature (some HMAC libraries emit it)', async () => {
    const request = signed(key, `/api/v1/machines/${machine.machineCode}/heartbeat`, { eventId: eventId() });
    const headers = new Headers(request.headers);
    headers.set('x-sq-signature', headers.get('x-sq-signature')!.replace(/^v1=/, 'v1=').replace(/[a-f]/g, (c) => c.toUpperCase()).replace(/^V1=/, 'v1='));
    const response = await routes.heartbeatRoute(new Request(request.url, { method: 'POST', headers, body: await request.text() }), routes.machine(machine.machineCode));
    expect(response.status).toBe(202);
  });

  it('refuses a body re-serialized after signing (whitespace changes the bytes)', async () => {
    const path = `/api/v1/machines/${machine.machineCode}/heartbeat`;
    const request = signed(key, path, { eventId: 'hb-x' });
    const reserialized = JSON.stringify({ eventId: 'hb-x' }, null, 2);
    const response = await routes.heartbeatRoute(new Request(request.url, { method: 'POST', headers: request.headers, body: reserialized }), routes.machine(machine.machineCode));
    expect((await response.json()).error.code).toBe('invalid_signature');
  });

  it('refuses malformed signature headers without throwing', async () => {
    for (const bad of ['v1=', 'v1=zz', 'v2=' + 'a'.repeat(64), 'a'.repeat(64), 'v1=' + 'a'.repeat(63)]) {
      const request = signed(key, `/api/v1/machines/${machine.machineCode}/heartbeat`, { eventId: eventId() });
      const headers = new Headers(request.headers);
      headers.set('x-sq-signature', bad);
      const response = await routes.heartbeatRoute(new Request(request.url, { method: 'POST', headers, body: await request.text() }), routes.machine(machine.machineCode));
      expect(response.status).toBe(401);
    }
  });

  it('a signature for one path is useless on another (machine code swap)', async () => {
    const other = await activeMachine(BUSINESS_ID, ids);
    const request = signed(key, `/api/v1/machines/${machine.machineCode}/heartbeat`, { eventId: eventId() });
    const response = await routes.heartbeatRoute(new Request(`http://localhost/api/v1/machines/${other.machineCode}/heartbeat`, { method: 'POST', headers: request.headers, body: await request.text() }), routes.machine(other.machineCode));
    expect((await response.json()).error.code).toBe('invalid_signature');
  });

  it('parses JSON only after authentication: invalid UTF-8 from a signed client is a 400, an unsigned one a 401', async () => {
    const invalidUtf8 = new Uint8Array([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d]);
    const good = await v1(key, machine.machineCode).heartbeat(undefined, { method: 'POST', rawBody: invalidUtf8 });
    expect(good.status).toBe(400);
    expect(good.error?.code).toBe('invalid_json');
    const unsigned = await routes.heartbeatRoute(new Request(`http://localhost/api/v1/machines/${machine.machineCode}/heartbeat`, { method: 'POST', body: invalidUtf8 }), routes.machine(machine.machineCode));
    expect(unsigned.status).toBe(401);
  });

  it('duplicate JSON keys cannot smuggle a second meaning past the signature — the signed bytes are what is parsed', async () => {
    const raw = '{"eventId":"dup-1","eventId":"dup-2"}';
    const result = await v1(key, machine.machineCode).heartbeat(undefined, { method: 'POST', rawBody: raw });
    expect(result.status).toBe(202);
  });
});

describe('error envelope and traceability', () => {
  it('every response carries a request id in the header and the body', async () => {
    const result = await v1(key, machine.machineCode).heartbeat({ eventId: eventId() });
    expect(result.headers.get('sq-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.requestId).toBe(result.headers.get('sq-request-id'));
    expect(result.headers.get('sq-api-version')).toBe('1');
  });

  it('echoes the client request id for correlation from the manufacturer side', async () => {
    const result = await v1(key, machine.machineCode).heartbeat({ eventId: eventId() }, { headers: { 'x-sq-client-request-id': 'nv-0001:req-42' } });
    expect(result.headers.get('sq-client-request-id')).toBe('nv-0001:req-42');
  });

  it('an unexpected server error is still an enveloped 500 with a request id, logged without secrets', async () => {
    vi.spyOn(machineApiService, 'heartbeat').mockRejectedValueOnce(new Error(`boom with ${key.secret} inside`));
    const logs = captureLogs();
    try {
      const result = await v1(key, machine.machineCode).heartbeat({ eventId: eventId() });
      expect(result.status).toBe(500);
      expect(result.error?.code).toBe('internal_error');
      expect(result.requestId).toBeTruthy();
      const logged = JSON.stringify(logs.entries);
      expect(logged).toContain(result.requestId!);
      expect(logged).not.toContain(key.secret);
    } finally {
      logs.restore();
    }
  });

  it('a retryable datastore error becomes a 503 with Retry-After', async () => {
    vi.spyOn(machineApiService, 'heartbeat').mockRejectedValueOnce(Object.assign(new Error('contention'), { code: 10 }));
    const result = await v1(key, machine.machineCode).heartbeat({ eventId: eventId() });
    expect(result.status).toBe(503);
    expect(result.error?.code).toBe('temporarily_unavailable');
    expect(result.headers.get('retry-after')).toBe('2');
  });

  it('never logs signing headers or the secret, even for a failed signature', async () => {
    const logs = captureLogs();
    try {
      const request = signed(key, `/api/v1/machines/${machine.machineCode}/heartbeat`, { eventId: eventId() });
      const headers = new Headers(request.headers);
      const signature = headers.get('x-sq-signature')!;
      headers.set('x-sq-signature', 'v1=' + '0'.repeat(64));
      await routes.heartbeatRoute(new Request(request.url, { method: 'POST', headers, body: await request.text() }), routes.machine(machine.machineCode));
      const logged = JSON.stringify(logs.entries);
      expect(logs.entries.length).toBeGreaterThan(0);
      expect(logged).not.toContain(key.secret);
      expect(logged).not.toContain(signature.slice(3));
    } finally {
      logs.restore();
    }
  });
});

describe('credential lifecycle', () => {
  it('rotation keeps the whole fleet online: both keys work during the grace period, the old one announces its replacement', async () => {
    const successor = await integrationCredentialService.rotate(BUSINESS_ID, key.keyId, { graceHours: 24 }, 'staff-1');
    expect(successor.rotatedFrom).toBe(key.keyId);
    expect(successor.keyId).not.toBe(key.keyId);

    const onOld = await v1(key, machine.machineCode).heartbeat({ eventId: eventId() });
    expect(onOld.status).toBe(202);
    expect(onOld.headers.get('sq-credential-status')).toBe('rotating');
    expect(new Date(onOld.headers.get('sq-credential-grace-ends')!).getTime()).toBeGreaterThan(Date.now());

    const onNew = await v1(successor, machine.machineCode).heartbeat({ eventId: eventId() });
    expect(onNew.status).toBe(202);
    expect(onNew.headers.get('sq-credential-status')).toBeNull();
  });

  it('after the grace period the old key is expired; the successor keeps working', async () => {
    const successor = await integrationCredentialService.rotate(BUSINESS_ID, key.keyId, { graceHours: 1 }, 'staff-1');
    await adminFirestore.collection('integrationCredentials').doc(key.keyId).update({ graceEndsAt: Timestamp.fromDate(new Date(Date.now() - 1000)) });
    expect((await v1(key, machine.machineCode).heartbeat({ eventId: eventId() })).error?.code).toBe('key_expired');
    expect((await v1(successor, machine.machineCode).heartbeat({ eventId: eventId() })).status).toBe(202);
  });

  it('a key can be rotated once; a revoked key cannot be rotated', async () => {
    await integrationCredentialService.rotate(BUSINESS_ID, key.keyId, {}, 'staff-1');
    await expect(integrationCredentialService.rotate(BUSINESS_ID, key.keyId, {}, 'staff-1')).rejects.toBeInstanceOf(CredentialRotationConflictError);
    const other = await apiKey(BUSINESS_ID, ids.manufacturerId);
    await integrationCredentialService.revoke(BUSINESS_ID, other.keyId, 'leaked', 'staff-1');
    await expect(integrationCredentialService.rotate(BUSINESS_ID, other.keyId, {}, 'staff-1')).rejects.toBeInstanceOf(CredentialRotationConflictError);
  });

  it('status moves issued → active on first use, and the summary never contains secret material', async () => {
    let [summary] = (await integrationCredentialService.listForManufacturer(BUSINESS_ID, ids.manufacturerId)).filter((c) => c.keyId === key.keyId);
    expect(summary.status).toBe('issued');
    await v1(key, machine.machineCode).heartbeat({ eventId: eventId() });
    await new Promise((resolve) => setTimeout(resolve, 200));
    [summary] = (await integrationCredentialService.listForManufacturer(BUSINESS_ID, ids.manufacturerId)).filter((c) => c.keyId === key.keyId);
    expect(summary.status).toBe('active');
    expect(summary.firstUsedAt).toBeTruthy();
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(key.secret);
    expect(serialized).not.toContain('secretEncrypted');
    expect(summary.secretHint).toMatch(/^sha256:[0-9a-f]{12}$/);
  });

  it('lastUsedAt is written at most once a minute, however busy the key is', async () => {
    const spy = vi.spyOn(integrationCredentialRepository, 'recordUse');
    for (let i = 0; i < 5; i += 1) {
      await v1(key, machine.machineCode).heartbeat({ eventId: eventId() });
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('a machine-scoped key reaches only its own machine — for every endpoint including connect', async () => {
    const other = await activeMachine(BUSINESS_ID, ids);
    const scoped = await apiKey(BUSINESS_ID, ids.manufacturerId, { machineId: machine.machineId });
    expect((await v1(scoped, machine.machineCode).heartbeat({ eventId: eventId() })).status).toBe(202);
    expect((await v1(scoped, other.machineCode).heartbeat({ eventId: eventId() })).error?.code).toBe('machine_not_found');
    expect((await v1(scoped, machine.machineCode).connect({ manufacturerMachineId: machine.manufacturerMachineId })).status).toBe(200);
    expect((await v1(scoped, machine.machineCode).connect({ manufacturerMachineId: other.manufacturerMachineId })).error?.code).toBe('machine_not_provisioned');
  });

  it('a machine-scoped key cannot be issued for another manufacturer\'s machine or the wrong environment', async () => {
    const rival = await onboardManufacturer(BUSINESS_ID, 'rival');
    await expect(apiKey(BUSINESS_ID, rival.manufacturerId, { machineId: machine.machineId })).rejects.toThrow(/not integrated with this manufacturer/);
    await expect(apiKey(BUSINESS_ID, ids.manufacturerId, { machineId: machine.machineId, environment: 'production' })).rejects.toThrow();
  });

  it('revocation takes effect on the next request of the revoking instance, and within the cache TTL elsewhere', async () => {
    process.env.CREDENTIAL_CACHE_TTL_MS = '60000';
    try {
      expect((await v1(key, machine.machineCode).heartbeat({ eventId: eventId() })).status).toBe(202);
      await integrationCredentialService.revoke(BUSINESS_ID, key.keyId, 'compromised', 'staff-1');
      expect((await v1(key, machine.machineCode).heartbeat({ eventId: eventId() })).error?.code).toBe('key_revoked');
    } finally {
      delete process.env.CREDENTIAL_CACHE_TTL_MS;
      invalidateCredentialCache();
    }
  });

  it('forged requests naming a real key are verified from cache, not a Firestore read each', async () => {
    process.env.CREDENTIAL_CACHE_TTL_MS = '60000';
    const spy = vi.spyOn(integrationCredentialRepository, 'findByKeyId');
    try {
      for (let i = 0; i < 5; i += 1) {
        const request = signed(key, `/api/v1/machines/${machine.machineCode}/heartbeat`, { eventId: eventId() }, { ip: '198.51.100.7' });
        const headers = new Headers(request.headers);
        headers.set('x-sq-signature', 'v1=' + 'f'.repeat(64));
        await routes.heartbeatRoute(new Request(request.url, { method: 'POST', headers, body: await request.text() }), routes.machine(machine.machineCode));
      }
      expect(spy.mock.calls.filter(([id]) => id === key.keyId).length).toBe(1);
    } finally {
      delete process.env.CREDENTIAL_CACHE_TTL_MS;
      invalidateCredentialCache();
    }
  });
});

describe('rate limiting and abuse isolation', () => {
  it('a machine over its heartbeat budget gets 429 with machine-readable details and Retry-After', async () => {
    await withinOneWindow();
    const client = v1(key, machine.machineCode);
    for (let i = 0; i < 12; i += 1) {
      expect((await client.heartbeat({ eventId: eventId() })).status).toBe(202);
    }
    const limited = await client.heartbeat({ eventId: eventId() });
    expect(limited.status).toBe(429);
    expect(limited.error?.code).toBe('rate_limited');
    expect(limited.error?.details).toMatchObject({ policy: 'machine.heartbeat', limit: 12, windowSeconds: 60 });
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(limited.headers.get('sq-ratelimit-policy')).toBe('machine.heartbeat');
  });

  it('one noisy machine cannot consume another machine\'s budget on the same key', async () => {
    const quiet = await activeMachine(BUSINESS_ID, ids);
    const noisy = v1(key, machine.machineCode);
    for (let i = 0; i < 20; i += 1) {
      await noisy.heartbeat({ eventId: eventId() });
    }
    expect((await noisy.heartbeat({ eventId: eventId() })).status).toBe(429);
    expect((await v1(key, quiet.machineCode).heartbeat({ eventId: eventId() })).status).toBe(202);
    // …and the noisy machine's other endpoints still work: the budget is per endpoint class.
    expect((await noisy.commands()).status).toBe(200);
  });

  it('forged requests never spend a real machine\'s budget', async () => {
    for (let i = 0; i < 30; i += 1) {
      const request = signed(key, `/api/v1/machines/${machine.machineCode}/heartbeat`, { eventId: eventId() });
      const headers = new Headers(request.headers);
      headers.set('x-sq-signature', 'v1=' + 'a'.repeat(64));
      await routes.heartbeatRoute(new Request(request.url, { method: 'POST', headers, body: await request.text() }), routes.machine(machine.machineCode));
    }
    expect((await v1(key, machine.machineCode).heartbeat({ eventId: eventId() })).status).toBe(202);
  });

  it('an IP sending invalid signatures is cut off; valid traffic from other IPs is untouched', async () => {
    process.env.MACHINE_API_RATE_LIMITS = JSON.stringify({ authFailuresPerIpPerMinute: 5 });
    const attacker = '203.0.113.66';
    for (let i = 0; i < 6; i += 1) {
      const request = signed(key, `/api/v1/machines/${machine.machineCode}/heartbeat`, { eventId: eventId() }, { ip: attacker });
      const headers = new Headers(request.headers);
      headers.set('x-sq-signature', 'v1=' + 'b'.repeat(64));
      await routes.heartbeatRoute(new Request(request.url, { method: 'POST', headers, body: await request.text() }), routes.machine(machine.machineCode));
    }
    const blocked = await v1(key, machine.machineCode).heartbeat({ eventId: eventId() }, { ip: attacker });
    expect(blocked.status).toBe(429);
    expect(blocked.error?.code).toBe('too_many_auth_failures');
    expect((await v1(key, machine.machineCode).heartbeat({ eventId: eventId() }, { ip: '192.0.2.10' })).status).toBe(202);
  });

  it('a machine sending malformed payloads continuously is throttled; its valid neighbours are not', async () => {
    process.env.MACHINE_API_RATE_LIMITS = JSON.stringify({ clientErrorsPerMachinePerMinute: 3 });
    const client = v1(key, machine.machineCode);
    for (let i = 0; i < 4; i += 1) {
      expect((await client.heartbeat(undefined, { method: 'POST', rawBody: '{not json' })).status).toBe(400);
    }
    const throttled = await client.heartbeat({ eventId: eventId() });
    expect(throttled.status).toBe(429);
    expect((throttled.error?.details as { policy: string }).policy).toBe('machine.client_errors');
    const neighbour = await activeMachine(BUSINESS_ID, ids);
    expect((await v1(key, neighbour.machineCode).heartbeat({ eventId: eventId() })).status).toBe(202);
  });

  it('event batches are charged per event, not per request', async () => {
    process.env.MACHINE_API_RATE_LIMITS = JSON.stringify({ perMachine: { event_items: { limit: 150, windowSeconds: 60 } } });
    const batch = () => ({ events: Array.from({ length: 100 }, () => ({ eventId: eventId(), type: 'DOOR_CLOSED' })) });
    expect((await v1(key, machine.machineCode).events(batch())).status).toBe(202);
    const second = await v1(key, machine.machineCode).events(batch());
    expect(second.status).toBe(429);
    expect((second.error?.details as { policy: string }).policy).toBe('machine.event_items');
  });

  it('a throttled request spends its nonce (so replays can\'t spend the machine\'s budget); the re-signed retry succeeds', async () => {
    process.env.MACHINE_API_RATE_LIMITS = JSON.stringify({ perMachine: { heartbeat: { limit: 1, windowSeconds: 60 } } });
    const client = v1(key, machine.machineCode);
    expect((await client.heartbeat({ eventId: eventId() })).status).toBe(202);
    const nonce = 'nonce-spent-by-a-429-000';
    expect((await client.heartbeat({ eventId: 'same' }, { nonce })).status).toBe(429);
    resetRateLimiterForTesting();
    expect((await client.heartbeat({ eventId: 'same' }, { nonce })).error?.code).toBe('replayed_request');
    // Every retry is re-signed with a fresh nonce (spec §3.5); the same eventId keeps it idempotent.
    expect((await client.heartbeat({ eventId: 'same' })).status).toBe(202);
  });

  it('a per-credential budget can be raised for a large fleet', async () => {
    const big = await integrationCredentialService.issue(BUSINESS_ID, ids.manufacturerId, { kind: 'api', environment: 'sandbox', label: 'big fleet', rateLimitPerMinute: 120_000 }, 'staff-1');
    const result = await v1(big, machine.machineCode).heartbeat({ eventId: eventId() });
    expect(result.status).toBe(202);
    expect(Number(result.headers.get('sq-ratelimit-limit'))).toBeGreaterThan(0);
  });
});

describe('event id reuse', () => {
  it('the same event id resent unchanged is a duplicate; resent with different content is reported as a conflict', async () => {
    const client = v1(key, machine.machineCode);
    const first = await client.events({ events: [{ eventId: 'door-1', type: 'DOOR_OPENED' }] });
    expect(first.data).toMatchObject({ recorded: 1, duplicates: 0, conflictingEventIds: [] });
    const same = await client.events({ events: [{ eventId: 'door-1', type: 'DOOR_OPENED' }] });
    expect(same.data).toMatchObject({ recorded: 0, duplicates: 1, conflictingEventIds: [] });
    const different = await client.events({ events: [{ eventId: 'door-1', type: 'DOOR_CLOSED' }] });
    expect(different.data).toMatchObject({ recorded: 0, duplicates: 0, conflictingEventIds: ['door-1'] });
  });

  it('a machine cannot send platform-only event types', async () => {
    const result = await v1(key, machine.machineCode).events({ events: [{ eventId: 'spoof-1', type: 'DISPENSE_OUTCOME_CONFLICT' }, { eventId: 'spoof-2', type: 'inventory_mismatch' }] });
    expect(result.data).toMatchObject({ recorded: 2, unknownTypes: ['DISPENSE_OUTCOME_CONFLICT', 'inventory_mismatch'] });
  });
});
