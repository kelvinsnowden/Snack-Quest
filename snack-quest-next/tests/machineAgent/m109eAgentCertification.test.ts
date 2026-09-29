import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { integrationCertificationService, CertificationNotAllowedError, type CertificationReport } from '@/services/integrationCertificationService';
import { connectHttpControlledSubject } from '@/lib/vending/contract/httpControlledSubject';
import { InProcessV1Transport } from '@/scripts/vendingSimulator/inProcessV1Transport';
import { MachineSlotService } from '@/services/machineSlotService';
import { resetRateLimiterForTesting } from '@/lib/rateLimit/rateLimiter';
import { clearIntegrationCollections } from '../helpers/integrationFixtures';
import { activeMachine, apiKey, onboardManufacturer, type Key, type V1Machine } from '../helpers/v1TestHarness';
import { SnackQuestMachineClient } from '@/sdk/typescript/snackQuestMachine';
import { FakeClock } from '@/machine-agent/agent/clock';
import { FakeM109eBoard, FakeM109eBus } from '@/machine-agent/transport/fakeM109e';
import { M109eProtocolClient } from '@/machine-agent/m109e/protocolClient';
import { SlotMap } from '@/machine-agent/m109e/slotMap';
import { Journal, MemoryJournalStorage } from '@/machine-agent/journal/journal';
import { DispenseDriver } from '@/machine-agent/m109e/dispenseDriver';
import { CONSERVATIVE_POLICY, type OutcomePolicy } from '@/machine-agent/m109e/outcomeMapper';
import { M109eMachineAgent } from '@/machine-agent/agent/m109eAgent';
import { agentSubject } from '@/machine-agent/sandbox/sandboxSubject';
import { SandboxOnlyError, startSandboxControlServer } from '@/machine-agent/sandbox/controlServer';

/**
 * The M109E Machine Agent, on a fake board that follows the protocol
 * document, through Snack Quest's certification harness. This proves the
 * agent's logic against the document — never the machine: the subject is
 * `snack_quest_simulator`, so the harness refuses to record it as model
 * evidence. Expected, and asserted, verdicts:
 *
 * - conservative policy (the only one allowed before acceptance test S5):
 *   NOT CERTIFIED on `inventory` (the M109E can't count stock) and
 *   `failure_handling` (an empty lane is reported `unknown`, not `failed`,
 *   because a curtain negative isn't trusted yet);
 * - curtain negatives trusted (what S5 would permit): NOT CERTIFIED on
 *   `inventory` only.
 */

const BUSINESS_ID = 'biz-m109e-agent-cert';
const SLOT = 'b1-m07';
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

beforeEach(async () => {
  resetRateLimiterForTesting();
  await clearIntegrationCollections(BUSINESS_ID);
  const ids = await onboardManufacturer(BUSINESS_ID, 'm109eco', { adapterKey: 'snack_quest_gateway' });
  machine = await activeMachine(BUSINESS_ID, ids, { adapterKey: 'snack_quest_gateway' });
  await new MachineSlotService().setSlotMappings(BUSINESS_ID, machine.machineId, [{ slotCode: 'A01', manufacturerSlotId: SLOT }]);
  key = await apiKey(BUSINESS_ID, ids.manufacturerId);
});

function agentOnFakeBoard(policy: OutcomePolicy) {
  const clock = new FakeClock();
  const bus = new FakeM109eBus();
  const board = bus.add(new FakeM109eBoard(1, [0, 0x64, 0, 0x3b, 4, 0x47, 0x36, 0x32, 0x33, 0x38, 0x36, 0x39], clock));
  board.load(7, 5);
  const protocol = new M109eProtocolClient(bus, { now: () => clock.now() });
  const slots = new SlotMap([{ slotId: SLOT, motorType: 0x03, curtainMode: 2 }]);
  const requests: { nonce: string; timestamp: number }[] = [];
  const api = new SnackQuestMachineClient({
    baseUrl: 'http://localhost',
    keyId: key.keyId,
    secret: key.secret,
    fetch: new InProcessV1Transport().fetch,
    sleep: async () => undefined,
    onAttempt: (attempt) => requests.push({ nonce: attempt.nonce, timestamp: attempt.timestamp }),
  });
  return { clock, board, protocol, slots, api, requests, build: async () => {
    const journal = await Journal.open(new MemoryJournalStorage());
    const driver = new DispenseDriver(protocol, journal, slots, clock, { policy, resultsPersistUntilRead: false });
    const agent = new M109eMachineAgent(api, protocol, slots, journal, driver, { manufacturerMachineId: machine.manufacturerMachineId, doorInput: 1 });
    const subject = agentSubject(
      agent,
      {
        openAndCloseDoor: async () => {
          board.setDoor(true);
          await agent.reportHealth();
          board.setDoor(false);
          await agent.reportHealth();
        },
        emptySlot: async (slotId) => {
          const lane = slots.get(slotId);
          if (lane) board.lane(lane.run.motor).stock = 0;
        },
      },
      () => requests,
    );
    return { agent, journal, subject };
  } };
}

const notPassed = (report: CertificationReport) => report.checks.filter((check) => check.outcome !== 'passed').map((check) => check.id).sort();

describe('M109E Machine Agent through the certification harness (fake board)', () => {
  it('conservative policy: NOT CERTIFIED on inventory and failure handling (and the expiry step, which the resulting slot quarantine blocks)', async () => {
    const setup = agentOnFakeBoard(CONSERVATIVE_POLICY);
    const { subject } = await setup.build();
    const report = await integrationCertificationService.run(BUSINESS_ID, machine.machineId, subject);
    expect(report.verdict).toBe('NOT CERTIFIED');
    expect(notPassed(report)).toEqual(['failure_handling', 'inventory', 'timeout_handling']);
    // timeout_handling is not verified, not failed: the unknown outcome quarantined the slot, so no sale could be made for that step.
    expect(report.checks.find((check) => check.id === 'timeout_handling')).toMatchObject({ outcome: 'not_verified', evidence: expect.stringMatching(/not available for sale/) });
    expect(report.checks.find((check) => check.id === 'failure_handling')?.evidence).toMatch(/manual_review|unknown|needs/i);
    // Each sale turned the motor at most once; the empty-lane sale turned it and nothing fell.
    expect(setup.board.dropped.length).toBeLessThanOrEqual(3);
  }, 120_000);

  it('curtain negatives trusted (after S5): NOT CERTIFIED on inventory only', async () => {
    const setup = agentOnFakeBoard({ curtainNegativeIsCertain: true });
    const { subject } = await setup.build();
    const report = await integrationCertificationService.run(BUSINESS_ID, machine.machineId, subject);
    expect(notPassed(report)).toEqual(['inventory']);
  }, 120_000);

  it('the same run over the sandbox control endpoints gives the same verdict', async () => {
    const setup = agentOnFakeBoard({ curtainNegativeIsCertain: true });
    const { subject } = await setup.build();
    const token = 'control-token-for-this-test-only-0123456789';
    const server = await startSandboxControlServer({ subject, apiKeyId: key.keyId, token });
    try {
      const unauthorized = await fetch(`${server.url}/capabilities`, { headers: { authorization: 'Bearer wrong' } });
      expect(unauthorized.status).toBe(401);
      const http = await connectHttpControlledSubject(server.url, token, { allowLocalHttp: true });
      const report = await integrationCertificationService.run(BUSINESS_ID, machine.machineId, http);
      expect(notPassed(report)).toEqual(['inventory']);
    } finally {
      await server.close();
    }
  }, 120_000);

  it('a fake-board run can never be recorded as evidence for the model', async () => {
    const { subject } = await agentOnFakeBoard({ curtainNegativeIsCertain: true }).build();
    await expect(integrationCertificationService.run(BUSINESS_ID, machine.machineId, subject, { recordToModel: true })).rejects.toBeInstanceOf(CertificationNotAllowedError);
  });

  it('the control server refuses to start with a live key', async () => {
    const { subject } = await agentOnFakeBoard(CONSERVATIVE_POLICY).build();
    await expect(startSandboxControlServer({ subject, apiKeyId: 'sqk_live_abcdefgh', token: 'x'.repeat(32) })).rejects.toBeInstanceOf(SandboxOnlyError);
  });
});
