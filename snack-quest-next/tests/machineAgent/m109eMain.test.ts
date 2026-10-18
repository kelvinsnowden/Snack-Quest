import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InProcessV1Transport } from '@/scripts/vendingSimulator/inProcessV1Transport';
import { MachineSlotService } from '@/services/machineSlotService';
import { machineTransactionService } from '@/services/machineTransactionService';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, type Key, type V1Machine } from '../helpers/v1TestHarness';
import { EXIT_NEEDS_A_PERSON, run } from '@/machine-agent/main';
import { AgentConfigError, validateConfig } from '@/machine-agent/config/agentConfig';

/**
 * The agent as a program — config file, secret file, journal on disk,
 * real HTTP — on a simulated M109E (`transport.kind: "fake"`), against
 * Snack Quest's real v1 routes served over a local HTTP port. This is
 * what someone running a fake machine against staging gets.
 */
const BUSINESS_ID = 'biz-m109e-agent-main';
const SLOT = 'b1-m07';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '9'.repeat(64);
  const transport = new InProcessV1Transport();
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name, String(value)]));
    const answer = await transport.fetch(`http://localhost${request.url}`, { method: request.method ?? 'GET', headers, body: Buffer.concat(chunks).toString('utf8') });
    response.writeHead(answer.status, Object.fromEntries(answer.headers.entries()));
    response.end(Buffer.from(await answer.arrayBuffer()));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let machine: V1Machine;
let key: Key;
let stop: AbortController;

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  const ids = await onboardManufacturer(BUSINESS_ID, 'm109emain', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  await new MachineSlotService().setSlotMappings(BUSINESS_ID, machine.machineId, [{ slotCode: 'A01', manufacturerSlotId: SLOT }]);
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
  stop = new AbortController();
});
afterEach(() => stop.abort());

async function writeConfig(overrides: Record<string, unknown> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sq-agent-'));
  await writeFile(join(dir, 'secret'), key.secret, { mode: 0o600 });
  const config = {
    snackQuest: { baseUrl, keyId: key.keyId, secretFile: 'secret' },
    manufacturerMachineId: machine.manufacturerMachineId,
    transport: { kind: 'fake', stock: { [SLOT]: 3 }, temperatureCelsius: 6 },
    slots: [{ slotId: SLOT, motorType: 3, curtainMode: 2 }],
    dataDir: 'data',
    ...overrides,
  };
  await writeFile(join(dir, 'config.json'), JSON.stringify(config));
  return { dir, path: join(dir, 'config.json') };
}

async function until<T>(check: () => Promise<T | null | undefined | false>, ms = 20_000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting');
    await new Promise((done) => setTimeout(done, 100));
  }
}

describe('the agent program on a fake machine', () => {
  it('connects, reports health, and sells: a test vend drops one product and is reported dispensed', async () => {
    const { dir, path } = await writeConfig();
    const logs: { level: string; message: string }[] = [];
    const running = run(['--config', path], { stop: stop.signal, log: (level, message) => void logs.push({ level, message }) });

    // Connected and reporting: heartbeat health and the fake probe's temperature arrive.
    const integration = await until(async () => {
      const found = await machineIntegrationRepository.findByMachineId(BUSINESS_ID, machine.machineId);
      return found?.agentHealth && found.lastReportedStatus ? found : null;
    });
    expect(integration.lastReportedStatus?.temperatureCelsius).toBe(6);
    expect(integration.integrationVersion).toMatch(/^m109e-agent\//);
    expect(integration.agentHealth?.owedReports).toBe(0);

    const vend = await machineTransactionService.startDiagnosticVend({ businessId: BUSINESS_ID, machineId: machine.machineId, slotCode: 'A01', requestId: 'main-test-vend-1', actor: 'staff-1' });
    expect(vend.commandRef).toBeTruthy();
    const done = await until(async () => {
      const command = await machineDispenseCommandRepository.findByCommandRef(BUSINESS_ID, vend.commandRef!);
      return command && ['dispensed', 'failed', 'unknown', 'timeout', 'rejected'].includes(command.status) ? command : null;
    });
    expect(done.status).toBe('dispensed');

    stop.abort();
    expect(await running).toBe(0);
    // The journal is on disk, ready for crash recovery.
    expect(await readFile(join(dir, 'data', 'journal.jsonl'), 'utf8')).toContain(vend.commandRef!);
    expect(logs.some((entry) => entry.message === 'starting')).toBe(true);
  }, 60_000);

  it('--check validates the config and exits without contacting Snack Quest', async () => {
    const { path } = await writeConfig();
    expect(await run(['--config', path, '--check'], { log: () => undefined })).toBe(0);
  });

  it('a broken config or a damaged acceptance record stops it for a person, not a restart loop', async () => {
    const { path } = await writeConfig({ slots: [] });
    expect(await run(['--config', path], { log: () => undefined })).toBe(EXIT_NEEDS_A_PERSON);
    const bad = await writeConfig({ acceptanceRecordFile: 'missing.json' });
    expect(await run(['--config', bad.path], { log: () => undefined })).toBe(EXIT_NEEDS_A_PERSON);
  });
});

describe('validateConfig', () => {
  const base = {
    snackQuest: { baseUrl: 'https://www.snackquests.shop', keyId: 'sqk_test_abc', secretFile: 'secret' },
    manufacturerMachineId: 'M-1',
    transport: { kind: 'serial', device: '/dev/ttyUSB0' },
    slots: [{ slotId: 'b1-m07', motorType: 3, curtainMode: 2 }],
    dataDir: '/var/lib/snack-quest-agent',
  };

  it('accepts a serial machine', () => {
    expect(validateConfig(base).transport.kind).toBe('serial');
  });

  it('refuses a fake machine with a live key, plain http to a real site, and a bad device path', () => {
    expect(() => validateConfig({ ...base, snackQuest: { ...base.snackQuest, keyId: 'sqk_live_abc' }, transport: { kind: 'fake' } })).toThrow(/sandbox key/);
    expect(() => validateConfig({ ...base, snackQuest: { ...base.snackQuest, baseUrl: 'http://www.snackquests.shop' } })).toThrow(AgentConfigError);
    expect(() => validateConfig({ ...base, transport: { kind: 'serial', device: 'COM3' } })).toThrow(/\/dev/);
  });
});
