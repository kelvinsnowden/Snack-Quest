import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { integrationCertificationService, CertificationNotAllowedError, type CertificationReport, type HarnessCheckId } from '@/services/integrationCertificationService';
import { V1SimulatedMachine } from '@/scripts/vendingSimulator/v1Machine';
import { InProcessV1Transport } from '@/scripts/vendingSimulator/inProcessV1Transport';
import { SimulatorCertificationSubject } from '@/scripts/vendingSimulator/certificationSubject';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, type Key, type V1Machine } from '../helpers/v1TestHarness';

/**
 * The harness is only worth trusting if it tells good from bad. So: a
 * correct machine must come out CERTIFIED, and each seeded integration
 * bug must come out NOT CERTIFIED — failing on the check that names that
 * bug, judged from what Snack Quest recorded, not from the machine's
 * claims.
 */

const BUSINESS_ID = 'biz-certification-harness';
const ORIGINAL = { business: process.env.SNACK_QUEST_BUSINESS_ID, key: process.env.SECRET_ENCRYPTION_KEY };
beforeAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = BUSINESS_ID;
  process.env.SECRET_ENCRYPTION_KEY = '8'.repeat(64);
});
afterAll(() => {
  process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL.business;
  process.env.SECRET_ENCRYPTION_KEY = ORIGINAL.key;
});

let ids: { manufacturerId: string; modelId: string };
let machine: V1Machine;
let key: Key;

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  ids = await onboardManufacturer(BUSINESS_ID, 'certco', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
});

function simulator(): V1SimulatedMachine {
  const sim = new V1SimulatedMachine(new InProcessV1Transport(), key, machine.manufacturerMachineId);
  sim.load('spiral_01', 5);
  return sim;
}

const failed = (report: CertificationReport) => report.checks.filter((check) => check.outcome !== 'passed').map((check) => check.id);

describe('certification harness', () => {
  it('a correct machine is CERTIFIED on every check, and the run is stored', async () => {
    const report = await integrationCertificationService.run(BUSINESS_ID, machine.machineId, new SimulatorCertificationSubject(simulator()));
    expect(report.failures).toEqual([]);
    expect(report.verdict).toBe('CERTIFIED');
    expect(report.checks).toHaveLength(15);
    expect((await adminFirestore.collection('integrationCertificationRuns').doc(report.runId).get()).get('verdict')).toBe('CERTIFIED');
  }, 60_000);

  const bugs: [string, (sim: V1SimulatedMachine) => void, HarnessCheckId[]][] = [
    ['dispenses without acknowledging', (sim) => (sim.inject.executeWithoutAck = true), ['acknowledgement']],
    ['reports "dispensed" for an empty slot', (sim) => (sim.inject.reportDispensedWhenEmpty = true), ['failure_handling']],
    ['re-sends a report under a new event id', (sim) => (sim.inject.freshEventIdOnRetry = true), ['idempotency']],
    ['never heartbeats', (sim) => (sim.inject.heartbeatFailure = true), ['heartbeat']],
    ['reuses nonces', (sim) => (sim.inject.fixedNonce = 'the-same-nonce-every-time'), ['replay_protection']],
    ['executes a command delivered twice (acknowledges everything it holds, then executes it all)', (sim) => (sim.inject.ignoreDuplicateDelivery = true), ['duplicate_delivery']],
    ['loses an outcome report it could not send (no persistent outbox)', (sim) => (sim.inject.forgetDeferredReport = true), ['offline_recovery']],
  ];

  for (const [bug, seed, expected] of bugs) {
    it(`a machine that ${bug} is NOT CERTIFIED, on ${expected.join(', ')}`, async () => {
      const sim = simulator();
      seed(sim);
      const report = await integrationCertificationService.run(BUSINESS_ID, machine.machineId, new SimulatorCertificationSubject(sim));
      expect(report.verdict).toBe('NOT CERTIFIED');
      for (const check of expected) {
        expect(failed(report), JSON.stringify(report.checks, null, 1)).toContain(check);
      }
    }, 60_000);
  }

  it('a subject that cannot be driven through a step is NOT CERTIFIED until a human verifies it', async () => {
    const full = new SimulatorCertificationSubject(simulator());
    const partial = { kind: 'manufacturer_machine' as const, cycle: () => full.cycle(), emitDoorEvents: () => full.emitDoorEvents(), emptySlot: (slot: string) => full.emptySlot(slot) };
    const report = await integrationCertificationService.run(BUSINESS_ID, machine.machineId, partial);
    expect(report.verdict).toBe('NOT CERTIFIED');
    expect(report.checks.filter((check) => check.outcome === 'not_verified').map((check) => check.id).sort()).toEqual(['duplicate_delivery', 'idempotency', 'offline_recovery', 'replay_protection', 'timeout_handling']);
  }, 60_000);

  /** A manufacturer's machine driven through the harness interface (here, one built on the reference firmware). */
  const asManufacturerMachine = (sim: V1SimulatedMachine) => {
    const inner = new SimulatorCertificationSubject(sim);
    return {
      kind: 'manufacturer_machine' as const,
      cycle: () => inner.cycle(),
      emitDoorEvents: () => inner.emitDoorEvents(),
      emptySlot: (slot: string) => inner.emptySlot(slot),
      pollWithoutExecuting: () => inner.pollWithoutExecuting(),
      retransmitLastReport: () => inner.retransmitLastReport(),
      deferNextReport: () => inner.deferNextReport(),
      requestLog: () => inner.requestLog(),
    };
  };
  const checklist = async () => (await adminFirestore.collection('machineModels').doc(ids.modelId).get()).get('certificationChecklist') as Record<string, { outcome: string; evidence: string }>;

  it('a passing run against a manufacturer machine records the contract suite as passed — the one check no human can tick', async () => {
    const report = await integrationCertificationService.run(BUSINESS_ID, machine.machineId, asManufacturerMachine(simulator()), { recordToModel: true });
    expect(report.verdict).toBe('CERTIFIED');
    const recorded = await checklist();
    expect(recorded.contract_suite).toMatchObject({ outcome: 'passed' });
    expect(recorded.contract_suite.evidence).toContain(report.runId);
  }, 60_000);

  it('a failing run records the contract suite as failed, with the reasons', async () => {
    const sim = simulator();
    sim.inject.executeWithoutAck = true;
    const report = await integrationCertificationService.run(BUSINESS_ID, machine.machineId, asManufacturerMachine(sim), { recordToModel: true });
    expect(report.verdict).toBe('NOT CERTIFIED');
    const recorded = await checklist();
    expect(recorded.contract_suite.outcome).toBe('failed');
    expect(recorded.contract_suite.evidence).toContain('failed:');
  }, 60_000);

  it('refuses production integrations, and refuses to record a simulator run as model evidence', async () => {
    const production = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway', environment: 'production' });
    await expect(integrationCertificationService.run(BUSINESS_ID, production.machineId, new SimulatorCertificationSubject(simulator()))).rejects.toThrow(CertificationNotAllowedError);
    await expect(integrationCertificationService.run(BUSINESS_ID, machine.machineId, new SimulatorCertificationSubject(simulator()), { recordToModel: true })).rejects.toThrow(/proves the harness/);
  });
});
