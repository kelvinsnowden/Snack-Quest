import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { integrationCertificationService, type CertificationReport } from '@/services/integrationCertificationService';
import { connectHttpControlledSubject } from '@/lib/vending/contract/httpControlledSubject';
import { probeManufacturerApi, type ProbeReport } from '@/lib/vending/contract/outboundProbe';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { V1SimulatedMachine } from '@/scripts/vendingSimulator/v1Machine';
import { InProcessV1Transport } from '@/scripts/vendingSimulator/inProcessV1Transport';
import { SimulatorCertificationSubject } from '@/scripts/vendingSimulator/certificationSubject';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer } from '../helpers/v1TestHarness';

/**
 * `npm run test:manufacturer-contract` — the manufacturer contract suite.
 *
 * Inbound (Model B, the manufacturer builds against the Snack Quest
 * Machine API): the certification harness drives a machine through its
 * sandbox control endpoints over real HTTP and checks every contract
 * obligation. Here the machine is the reference firmware (the published
 * TypeScript SDK) behind a real control server, which proves the suite
 * end to end; a manufacturer's machine is run the same way from the
 * admin console (POST /api/vending/machines/{id}/certification-runs).
 *
 * Outbound (Model A, Snack Quest calls the manufacturer's API): the
 * probe checks an API against the reference contract. Here against a
 * compliant and a broken fake over real sockets; set
 * SQ_CONTRACT_PROBE_URL, SQ_CONTRACT_PROBE_KEY and
 * SQ_CONTRACT_PROBE_MACHINE (and SQ_CONTRACT_PROBE_VEND=1 for the
 * dispensing checks, sandbox only) to probe a real manufacturer API.
 */

const BUSINESS_ID = 'biz-manufacturer-contract';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
const servers: Server[] = [];
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '6'.repeat(64);
});
afterAll(async () => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
});
beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
});

async function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function printReport(title: string, rows: { id: string; outcome: string; evidence: string }[], verdict: string) {
  const width = Math.max(...rows.map((row) => row.id.length));
  console.log(`\n${title}: ${verdict}\n${rows.map((row) => `  ${row.outcome === 'passed' ? 'PASS' : row.outcome === 'failed' ? 'FAIL' : row.outcome.toUpperCase().padEnd(4)}  ${row.id.padEnd(width)}  ${row.evidence}`).join('\n')}\n`);
}

/** Sandbox control endpoints (docs/MANUFACTURER_CERTIFICATION.md) in front of a machine. */
async function controlServer(sim: V1SimulatedMachine, token: string): Promise<string> {
  const inner = new SimulatorCertificationSubject(sim);
  return listen((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', async () => {
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401).end();
        return;
      }
      const reply = (body: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body ?? null));
      try {
        switch (`${req.method} ${req.url}`) {
          case 'GET /capabilities': return reply({ supports: ['hold', 'retransmit', 'request-log'] });
          case 'POST /cycle': await inner.cycle(); return reply({ ok: true });
          case 'POST /door-events': await inner.emitDoorEvents(); return reply({ ok: true });
          case 'POST /empty-slot': await inner.emptySlot(JSON.parse(raw).slotId); return reply({ ok: true });
          case 'POST /hold-next-commands': await inner.pollWithoutExecuting(); return reply({ ok: true });
          case 'POST /retransmit-last-report': return reply(await inner.retransmitLastReport());
          case 'GET /request-log': return reply(inner.requestLog());
          default: res.writeHead(404).end();
        }
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(error) }));
      }
    });
  });
}

describe('inbound contract (Machine API v1) — harness over sandbox control endpoints', () => {
  it('the reference firmware passes every check, and the result is recorded on the model as contract_suite', async () => {
    const ids = await onboardManufacturer(BUSINESS_ID, 'contractco', { adapterKey: 'snack_quest_gateway' });
    const machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
    const key = await apiKey(BUSINESS_ID, ids.manufacturerId);
    const sim = new V1SimulatedMachine(new InProcessV1Transport(), key, machine.manufacturerMachineId);
    sim.load('spiral_01', 5);
    const url = await controlServer(sim, 'control-token-123');

    const subject = await connectHttpControlledSubject(url, 'control-token-123', { allowLocalHttp: true });
    const report: CertificationReport = await integrationCertificationService.run(BUSINESS_ID, machine.machineId, subject, { recordToModel: true });
    printReport('Inbound contract suite', report.checks.map((c) => ({ id: c.id, outcome: c.outcome, evidence: c.evidence })), report.verdict);
    expect(report.failures).toEqual([]);
    expect(report.verdict).toBe('CERTIFIED');
    expect((await adminFirestore.collection('machineModels').doc(ids.modelId).get()).get('certificationChecklist.contract_suite.outcome')).toBe('passed');
  }, 120_000);

  it('a control endpoint that refuses the token is reported as unreachable, not as a pass', async () => {
    const url = await listen((_req, res) => res.writeHead(401).end());
    await expect(connectHttpControlledSubject(url, 'wrong', { allowLocalHttp: true })).rejects.toThrow(/401/);
  });
});

/** A manufacturer API. `compliant: false` gets the three things adapters depend on wrong. */
async function manufacturerApi(compliant: boolean): Promise<string> {
  const vends = new Map<string, string>();
  return listen((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const json = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
      if (compliant && req.headers.authorization !== 'Bearer mfr-key-123') return json(401, { error: 'bad key' });
      const vend = req.url?.match(/\/vends\/([^/]+)$/);
      if (vend && req.method === 'PUT') {
        if (!compliant && vends.has(vend[1])) return json(409, { error: 'duplicate' });
        vends.set(vend[1], 'dispensed');
        return json(201, { accepted: true });
      }
      if (vend) {
        const state = vends.get(vend[1]);
        if (!state) return compliant ? json(404, { error: 'unknown vend' }) : json(200, {});
        return json(200, { state });
      }
      return json(200, { online: true, doorOpen: false, faults: [] });
    });
  });
}

describe('outbound contract (manufacturer API) — probe', () => {
  it('a compliant API passes, including the dispensing checks', async () => {
    const report: ProbeReport = await probeManufacturerApi({ baseUrl: await manufacturerApi(true), apiKey: 'mfr-key-123', manufacturerMachineId: 'M-1', includeVend: true });
    printReport('Outbound probe (compliant reference API)', report.checks, report.verdict);
    expect(report.verdict).toBe('PASS');
  });

  it('a broken API fails on exactly what it gets wrong', async () => {
    const report = await probeManufacturerApi({ baseUrl: await manufacturerApi(false), apiKey: 'mfr-key-123', manufacturerMachineId: 'M-1', includeVend: true });
    printReport('Outbound probe (deliberately broken API)', report.checks, report.verdict);
    expect(report.verdict).toBe('FAIL');
    expect(report.checks.filter((c) => c.outcome === 'failed').map((c) => c.id).sort()).toEqual(['auth_rejected', 'unknown_vend', 'vend_idempotent']);
  });

  const target = process.env.SQ_CONTRACT_PROBE_URL;
  it.runIf(Boolean(target))('the manufacturer API named in SQ_CONTRACT_PROBE_URL', async () => {
    const report = await probeManufacturerApi({ baseUrl: target!, apiKey: process.env.SQ_CONTRACT_PROBE_KEY ?? '', manufacturerMachineId: process.env.SQ_CONTRACT_PROBE_MACHINE ?? '', slotId: process.env.SQ_CONTRACT_PROBE_SLOT, includeVend: process.env.SQ_CONTRACT_PROBE_VEND === '1' });
    printReport(`Outbound probe (${target})`, report.checks, report.verdict);
    expect(report.verdict).toBe('PASS');
  }, 120_000);
});
