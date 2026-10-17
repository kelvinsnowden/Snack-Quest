import { describe, expect, it, vi } from 'vitest';
import { blankAcceptanceRecord, capabilityGate, type AcceptanceRecord } from '@/machine-agent/acceptance/acceptanceRecord';
import { Thermostat, parseCoolingTarget, CoolingTargetError } from '@/machine-agent/agent/thermostat';
import { FakeClock } from '@/machine-agent/agent/clock';
import { FakeM109eBoard, FakeM109eBus } from '@/machine-agent/transport/fakeM109e';
import { M109eProtocolClient } from '@/machine-agent/m109e/protocolClient';
import { SlotMap } from '@/machine-agent/m109e/slotMap';
import { Journal, MemoryJournalStorage } from '@/machine-agent/journal/journal';
import { DispenseDriver } from '@/machine-agent/m109e/dispenseDriver';
import { CONSERVATIVE_POLICY } from '@/machine-agent/m109e/outcomeMapper';
import { M109eMachineAgent } from '@/machine-agent/agent/m109eAgent';
import type { SnackQuestMachineClient } from '@/sdk/typescript/snackQuestMachine';

const MIN = 60_000;
const pass = (record: AcceptanceRecord, ...ids: string[]) => {
  for (const id of ids) record.results[id] = { result: 'passed', date: '2026-10-01', tester: 'bench tech', evidence: `logs/${id}` };
  return record;
};

describe('cooling in the acceptance gate', () => {
  it('lets the agent run the cooling only when S8, S11 and S12 passed and the host owns a known compressor output', () => {
    expect(capabilityGate(blankAcceptanceRecord('M109E')).agent.cooling).toBeNull();

    const boardRuns = pass(blankAcceptanceRecord('M109E'), 'S8', 'S11', 'S12');
    boardRuns.findings.refrigeration = { owner: 'board', board: null, compressorOutput: null };
    const monitored = capabilityGate(boardRuns);
    expect(monitored.agent.cooling).toBeNull();
    expect(monitored.declaredCapabilities).toContain('temperature');
    expect(monitored.declaredCapabilities).not.toContain('remote_cooling');

    const hostRuns = pass(blankAcceptanceRecord('M109E'), 'S8', 'S11', 'S12');
    hostRuns.findings.refrigeration = { owner: 'host', board: 1, compressorOutput: 2 };
    const controlled = capabilityGate(hostRuns);
    expect(controlled.agent.cooling).toEqual({ board: 1, compressorOutput: 2 });
    expect(controlled.declaredCapabilities).toContain('remote_cooling');
  });

  it('refuses a refrigeration finding without the tests behind it', () => {
    const record = pass(blankAcceptanceRecord('M109E'), 'S11');
    record.findings.refrigeration = { owner: 'host', board: 1, compressorOutput: 2 };
    expect(() => capabilityGate(record)).toThrow(/S11 and S12/);
  });
});

describe('Thermostat', () => {
  it('cools above the range, stops below it and holds inside it', () => {
    const thermostat = new Thermostat({ enabled: true, minCelsius: 3, maxCelsius: 8 });
    expect(thermostat.decide(6, 0)).toBeNull();
    expect(thermostat.decide(9, 0)).toBe(true);
    thermostat.switched(true, 0);
    expect(thermostat.decide(5, 10 * MIN)).toBeNull();
    expect(thermostat.decide(2.5, 10 * MIN)).toBe(false);
  });

  it('never short-cycles the compressor', () => {
    const thermostat = new Thermostat({ enabled: true, minCelsius: 3, maxCelsius: 8 });
    thermostat.switched(true, 0);
    expect(thermostat.decide(2, 2 * MIN)).toBeNull(); // too soon after starting
    expect(thermostat.decide(2, 3 * MIN)).toBe(false);
    thermostat.switched(false, 3 * MIN);
    expect(thermostat.decide(10, 6 * MIN)).toBeNull(); // too soon after stopping
    expect(thermostat.decide(10, 8 * MIN)).toBe(true);
  });

  it('switches off with no usable reading, or when told the machine is not cooled', () => {
    const thermostat = new Thermostat({ enabled: true, minCelsius: 3, maxCelsius: 8 });
    thermostat.switched(true, 0);
    expect(thermostat.decide(-50, 10 * MIN)).toBe(false);
    expect(thermostat.decide(null, 10 * MIN)).toBe(false);
    thermostat.setTarget({ enabled: false, minCelsius: 3, maxCelsius: 8 });
    expect(thermostat.decide(20, 10 * MIN)).toBe(false);
  });

  it('starts from the default range, so a restart never leaves the fridge off', () => {
    expect(new Thermostat().currentTarget).toEqual({ enabled: true, minCelsius: 3, maxCelsius: 8 });
  });

  it('checks set_cooling payloads', () => {
    expect(parseCoolingTarget({ enabled: true, minCelsius: 2, maxCelsius: 6 })).toEqual({ enabled: true, minCelsius: 2, maxCelsius: 6 });
    expect(() => parseCoolingTarget({ enabled: true, minCelsius: 5, maxCelsius: 6 })).toThrow(CoolingTargetError);
    expect(() => parseCoolingTarget(null)).toThrow(CoolingTargetError);
  });
});

describe('the agent and set_cooling', () => {
  async function agentWith(cooling: { board: number; compressorOutput: number } | null) {
    const clock = new FakeClock();
    const bus = new FakeM109eBus();
    const board = bus.add(new FakeM109eBoard(1, [0, 0x64, 0, 0x3b, 4, 0x47, 0x36, 0x32, 0x33, 0x38, 0x36, 0x39], clock));
    const protocol = new M109eProtocolClient(bus, { now: () => clock.now() });
    const slots = new SlotMap([{ slotId: 'b1-m07', motorType: 0x03, curtainMode: 2 }]);
    const journal = await Journal.open(new MemoryJournalStorage());
    const driver = new DispenseDriver(protocol, journal, slots, clock, { policy: CONSERVATIVE_POLICY, resultsPersistUntilRead: false });
    const reports: { commandId: string; report: Record<string, unknown> }[] = [];
    const statuses: Record<string, unknown>[] = [];
    let commands: Record<string, unknown>[] = [];
    const ok = <T>(data: T) => ({ status: 200, ok: true, data, error: null, requestId: null, attempts: 1 });
    const api = {
      clockOffset: 0,
      connect: vi.fn(async () => ok({ machineCode: 'SQ1' })),
      heartbeat: vi.fn(async () => ok({ reportOutcomes: [] })),
      status: vi.fn(async (_code: string, body: Record<string, unknown>) => {
        statuses.push(body);
        return ok({});
      }),
      events: vi.fn(async () => ok({})),
      pollCommands: vi.fn(async () => {
        const out = commands;
        commands = [];
        return ok({ commands: out, nextPollSeconds: 10 });
      }),
      ack: vi.fn(async () => ok({})),
      report: vi.fn(async (_code: string, commandId: string, report: Record<string, unknown>) => {
        reports.push({ commandId, report });
        return ok({ result: 'applied' });
      }),
    } as unknown as SnackQuestMachineClient;
    const saved: unknown[] = [];
    const agent = new M109eMachineAgent(api, protocol, slots, journal, driver, {
      manufacturerMachineId: 'M-1',
      doorInput: null,
      cooling,
      coolingStore: { load: () => null, save: (target) => void saved.push(target) },
      wallNow: () => clock.now(),
    });
    const send = (payload: Record<string, unknown>) => {
      commands = [{ commandId: `CMD-${commands.length}-${clock.now()}`, type: 'set_cooling', payload, expiresAt: new Date(clock.now() + 10 * MIN).toISOString() }];
    };
    return { clock, board, agent, reports, statuses, saved, send };
  }

  it('applies a new range, keeps it, reports completed and drives the compressor output', async () => {
    const { clock, board, agent, reports, saved, send } = await agentWith({ board: 1, compressorOutput: 2 });
    board.temperatureTenths = 45; // 4.5 °C
    send({ enabled: true, minCelsius: 1, maxCelsius: 4 });
    await agent.cycle();
    expect(reports.at(-1)?.report.status).toBe('completed');
    expect(saved).toEqual([{ enabled: true, minCelsius: 1, maxCelsius: 4 }]);

    // Next cycle reads 4.5 °C, above the new 4 °C ceiling: compressor on.
    await agent.cycle();
    expect(board.outputs.get(2)).toBe(true);

    clock.advance(10 * MIN);
    board.temperatureTenths = 5; // 0.5 °C
    await agent.cycle();
    expect(board.outputs.get(2)).toBe(false);
  });

  it('declines set_cooling when the board runs its own cooling, and never touches an output', async () => {
    const { board, agent, reports, send } = await agentWith(null);
    send({ enabled: true, minCelsius: 1, maxCelsius: 4 });
    await agent.cycle();
    expect(reports.at(-1)?.report).toMatchObject({ status: 'failed' });
    expect(String(reports.at(-1)?.report.failureReason)).toMatch(/runs its own cooling/);
    expect(board.outputs.size).toBe(0);
  });
});
