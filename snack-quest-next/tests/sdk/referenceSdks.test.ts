import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { canonicalString, runPollCycle, MemoryOutbox, newEventId, signatureHeader, SnackQuestMachineClient, type FetchLike } from '@/sdk/typescript/snackQuestMachine';
import { InProcessV1Transport } from '@/scripts/vendingSimulator/inProcessV1Transport';
import { machineTransactionService } from '@/services/machineTransactionService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineCommandService } from '@/services/machineCommandService';
import { machineCommandRepository } from '@/repositories/machineCommandRepository';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, v1, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * The reference SDKs are what a manufacturer copies. They are held to
 * three standards: they reproduce the official signing vectors byte for
 * byte; they stand alone (no Snack Quest imports, no third-party
 * dependencies); and they complete a real sale against the real server —
 * the TypeScript client in-process, the Python client over actual HTTP.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const VECTORS = JSON.parse(readFileSync(path.join(ROOT, 'docs/machine-api/signing-test-vectors.json'), 'utf8')) as {
  secret: string;
  vectors: { name: string; method: string; pathWithQuery: string; timestamp: string; nonce: string; bodyUtf8Hex: string; canonical: string; signatureHeader: string }[];
};

describe('signing vectors', () => {
  it('the TypeScript client reproduces every vector', () => {
    for (const vector of VECTORS.vectors) {
      const canonical = canonicalString({ method: vector.method, pathWithQuery: vector.pathWithQuery, timestamp: Number(vector.timestamp), nonce: vector.nonce, body: Buffer.from(vector.bodyUtf8Hex, 'hex') });
      expect(canonical, vector.name).toBe(vector.canonical);
      expect(signatureHeader(VECTORS.secret, canonical), vector.name).toBe(vector.signatureHeader);
    }
  });

  it('the Python client reproduces every vector', async () => {
    const result = await run('python3', ['-m', 'unittest', 'test_signing_vectors.py'], { cwd: path.join(ROOT, 'sdk/python') });
    expect(result.code, result.stderr).toBe(0);
  });
  // Needs a C compiler and OpenSSL headers; without them the test is reported skipped, never passed.
  const cToolchain = existsSync('/usr/bin/cc') && existsSync('/usr/include/openssl/hmac.h');
  it.skipIf(!cToolchain)('the C signing reference reproduces every vector', async () => {
    const binary = path.join(mkdtempSync(path.join(os.tmpdir(), 'sq-c-')), 'vector_check');
    const build = await run('cc', ['-std=c99', '-Wall', '-Wextra', '-Werror', '-o', binary, path.join(ROOT, 'sdk/c/vector_check.c'), path.join(ROOT, 'sdk/c/sq_sign.c'), '-lcrypto'], {});
    expect(build.code, build.stderr).toBe(0);
    for (const vector of VECTORS.vectors) {
      const result = await run(binary, [VECTORS.secret, vector.method, vector.pathWithQuery, vector.timestamp, vector.nonce, vector.bodyUtf8Hex], {});
      expect(result.code, result.stderr).toBe(0);
      expect(result.stdout.trim(), vector.name).toBe(vector.signatureHeader);
    }
  });
});

describe('the SDKs stand alone', () => {
  it('TypeScript imports only node:crypto', () => {
    const source = readFileSync(path.join(ROOT, 'sdk/typescript/snackQuestMachine.ts'), 'utf8');
    const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map((match) => match[1]);
    expect(imports).toEqual(['node:crypto']);
  });

  it('Python imports only the standard library', () => {
    const source = readFileSync(path.join(ROOT, 'sdk/python/snack_quest_machine.py'), 'utf8');
    const modules = [...source.matchAll(/^(?:from (\S+) import|import (\S+))/gm)].map((match) => (match[1] ?? match[2]).split('.')[0]);
    const stdlib = new Set(['hashlib', 'hmac', 'json', 'secrets', 'time', 'urllib', 'dataclasses', 'typing']);
    expect(modules.filter((module) => !stdlib.has(module))).toEqual([]);
  });
});

const BUSINESS_ID = 'biz-reference-sdks';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '9'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let machine: V1Machine;
let key: Key;
const transport = new InProcessV1Transport();

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  const ids = await onboardManufacturer(BUSINESS_ID, 'sdkco', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
  // The machine has been online: Snack Quest won't queue a dispense for one it has never heard from.
  await v1(key, machine.machineCode).heartbeat({ eventId: `hb-setup-${Date.now()}` });
});

async function queuedSale(): Promise<string> {
  const { id } = await machineTransactionService.createPending({ businessId: BUSINESS_ID, machineId: machine.machineId, slotId: 'A01', paymentMethod: 'mpesa' });
  await machineTransactionService.markPaymentVerified(BUSINESS_ID, id, `RSDK${id.slice(0, 6).toUpperCase()}`);
  await machineTransactionService.authorizeVend(BUSINESS_ID, id);
  return id;
}

const statusOf = async (id: string) => (await machineTransactionRepository.findById(BUSINESS_ID, id))?.status;

function client(overrides: Partial<ConstructorParameters<typeof SnackQuestMachineClient>[0]> = {}) {
  return new SnackQuestMachineClient({ baseUrl: 'http://sandbox.local', keyId: key.keyId, secret: key.secret, fetch: transport.fetch as unknown as FetchLike, sleep: async () => undefined, ...overrides });
}

describe('TypeScript client against the real server', () => {
  it('runs the whole integration: connect, report, poll, ack, dispense, report', async () => {
    const sale = await queuedSale();
    const sdk = client();
    const connected = await sdk.connect({ manufacturerMachineId: machine.manufacturerMachineId, firmwareVersion: 'ts-ref-1.0.0' });
    expect(connected.status).toBe(200);
    const code = connected.data!.machineCode;
    expect((await sdk.heartbeat(code, { eventId: newEventId('hb') })).ok).toBe(true);
    expect((await sdk.status(code, { eventId: newEventId('st'), online: true, doorOpen: false })).ok).toBe(true);
    expect((await sdk.inventory(code, { reportId: newEventId('inv'), slots: [{ slotId: 'spiral_01', quantity: 5 }] })).data?.mismatches).toEqual([]);
    expect((await sdk.events(code, { events: [{ eventId: newEventId('ev'), type: 'DOOR_OPENED' }] })).data?.recorded).toBe(1);

    const cycle = await runPollCycle(sdk, code, { dispense: async () => ({ outcome: 'dispensed' }) }, new MemoryOutbox());
    expect(cycle.executed).toHaveLength(1);
    expect(await statusOf(sale)).toBe('dispensed');
  });

  it('a command type the machine does not implement is acknowledged and declined, never dropped (spec §4.4)', async () => {
    const { commandId } = await machineCommandService.issueCommand({ businessId: BUSINESS_ID, machineId: machine.machineId, commandType: 'restart', requestedBy: 'staff-1' });
    let dispensed = 0;
    const cycle = await runPollCycle(client(), machine.machineCode, { dispense: async () => ((dispensed += 1), { outcome: 'dispensed' }) }, new MemoryOutbox());
    const command = await machineCommandRepository.findById(BUSINESS_ID, commandId);
    expect(dispensed).toBe(0);
    expect(cycle.refused).toHaveLength(1);
    expect(command?.status).toBe('failed');
    expect(command?.error).toBe('unsupported command');
  });

  it('a report whose response was lost is re-sent from the outbox with the same event id, and counted once', async () => {
    const sale = await queuedSale();
    let dropNextReport = true;
    const lossy: FetchLike = async (url, init) => {
      const response = await transport.fetch(url, init);
      if (dropNextReport && url.endsWith('/status') && init.method === 'POST' && url.includes('/commands/')) {
        dropNextReport = false;
        throw new Error('ECONNRESET after the server processed it');
      }
      return response;
    };
    const outbox = new MemoryOutbox();
    const sdk = client({ fetch: lossy, maxAttempts: 1 });
    await runPollCycle(sdk, machine.machineCode, { dispense: async () => ({ outcome: 'dispensed' }) }, outbox);
    expect(await outbox.list()).toHaveLength(1);
    expect(await statusOf(sale)).toBe('dispensed');
    // Next cycle flushes the outbox: same eventId, accepted as a duplicate, removed.
    await runPollCycle(sdk, machine.machineCode, { dispense: async () => ({ outcome: 'dispensed' }) }, outbox);
    expect(await outbox.list()).toEqual([]);
  });

  it('corrects a clock that is 20 minutes slow from the server\'s answer', async () => {
    const sdk = client({ now: () => Date.now() - 20 * 60_000 });
    const result = await sdk.heartbeat(machine.machineCode, { eventId: newEventId('hb') });
    expect(result.ok).toBe(true);
    expect(Math.abs(sdk.clockOffset - 1200)).toBeLessThan(5);
  });

  it('retries 5xx with identical bytes and a fresh nonce; gives up on 4xx at once', async () => {
    const seen: { nonce: string; body: string }[] = [];
    let failures = 2;
    const flaky: FetchLike = async (url, init) => {
      seen.push({ nonce: init.headers['X-SQ-Nonce'], body: init.body ?? '' });
      if (failures-- > 0) {
        return { status: 503, headers: { get: () => null }, text: async () => '{"error":{"code":"temporarily_unavailable","message":"x"}}' };
      }
      return transport.fetch(url, init);
    };
    const result = await client({ fetch: flaky }).heartbeat(machine.machineCode, { eventId: 'hb-retry-1' });
    expect(result).toMatchObject({ ok: true, attempts: 3 });
    expect(new Set(seen.map((s) => s.body)).size).toBe(1);
    expect(new Set(seen.map((s) => s.nonce)).size).toBe(3);

    const invalid = await client().status(machine.machineCode, { eventId: 'st-bad' } as never);
    expect(invalid).toMatchObject({ status: 422, attempts: 1 });
  });

  it('never dispenses a command whose ack was refused', async () => {
    await queuedSale();
    let dispensed = 0;
    const refusingAck: FetchLike = async (url, init) =>
      url.endsWith('/ack') ? { status: 409, headers: { get: () => null }, text: async () => '{"error":{"code":"command_not_executable","message":"expired"}}' } : transport.fetch(url, init);
    const cycle = await runPollCycle(client({ fetch: refusingAck }), machine.machineCode, { dispense: async () => { dispensed += 1; return { outcome: 'dispensed' }; } }, new MemoryOutbox());
    expect(cycle.refused).toHaveLength(1);
    expect(dispensed).toBe(0);
  });
});

describe('Python client against the real server, over HTTP', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const headers = Object.fromEntries(Object.entries(req.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(',') : (value ?? '')]));
          const response = await transport.fetch(`http://127.0.0.1${req.url}`, { method: req.method ?? 'GET', headers, body: Buffer.concat(chunks).toString('utf8') });
          res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
          res.end(await response.text());
        } catch (error) {
          res.writeHead(500).end(JSON.stringify({ error: { code: 'bridge_error', message: String(error) } }));
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('completes a sale end to end, and declines a command type it does not implement', async () => {
    const sale = await queuedSale();
    const { commandId: restart } = await machineCommandService.issueCommand({ businessId: BUSINESS_ID, machineId: machine.machineId, commandType: 'restart', requestedBy: 'staff-1' });
    const env: Record<string, string> = { PATH: process.env.PATH ?? '', SQ_BASE_URL: baseUrl, SQ_KEY_ID: key.keyId, SQ_SECRET: key.secret, SQ_MACHINE_ID: machine.manufacturerMachineId, NO_PROXY: '*', no_proxy: '*' };
    const result = await run('python3', [path.join(ROOT, 'sdk/python/example_machine.py')], { env });
    expect(result.code, result.stderr + result.stdout).toBe(0);
    const steps = result.stdout.trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    const byStep = Object.fromEntries(steps.map((step) => [step.step, step]));
    expect(byStep.connect.status).toBe(200);
    for (const step of ['heartbeat', 'status', 'inventory', 'events']) {
      expect((byStep[step].status as number) < 300, `${step}: ${JSON.stringify(byStep[step])}`).toBe(true);
    }
    expect((byStep.cycle.executed as string[]).length).toBe(1);
    expect(byStep.log.nonces_unique).toBe(true);
    expect(await statusOf(sale)).toBe('dispensed');
    expect(byStep.cycle.refused).toEqual([(await machineCommandRepository.findById(BUSINESS_ID, restart))?.commandRef]);
    expect((await machineCommandRepository.findById(BUSINESS_ID, restart))?.status).toBe('failed');
  }, 60_000);
});

function run(command: string, args: string[], options: { cwd?: string; env?: Record<string, string> }): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, env: (options.env ?? process.env) as NodeJS.ProcessEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}
