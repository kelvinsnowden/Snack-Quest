import { describe, expect, it } from 'vitest';
import { FakeClock } from '@/machine-agent/agent/clock';
import { FakeM109eBoard, FakeM109eBus } from '@/machine-agent/transport/fakeM109e';
import { M109eProtocolClient } from '@/machine-agent/m109e/protocolClient';
import { SlotMap } from '@/machine-agent/m109e/slotMap';
import { CONSERVATIVE_POLICY } from '@/machine-agent/m109e/outcomeMapper';
import { Journal, MemoryJournalStorage } from '@/machine-agent/journal/journal';
import { DispenseDriver } from '@/machine-agent/m109e/dispenseDriver';
import { M109eMachineAgent } from '@/machine-agent/agent/m109eAgent';
import type { SnackQuestMachineClient } from '@/sdk/typescript/snackQuestMachine';

/**
 * How often the agent talks to Snack Quest. Found on a walk-through: the
 * agent sent a heartbeat and a status on every cycle; while orders were
 * coming in it cycles every 2 s, Snack Quest allows 12 heartbeats a
 * minute, and the SDK's back-off on the 429 stalled the loop — command
 * polling included — so a paid snack came out 33 s late.
 */

const ID = [0x00, 0x64, 0x00, 0x3b, 0x04, 0x47, 0x36, 0x32, 0x33, 0x38, 0x36, 0x39];

function fakeApi() {
  const calls: string[] = [];
  const ok = <T>(data: T) => Promise.resolve({ ok: true, status: 200, data });
  const api = {
    clockOffset: 0,
    connect: () => { calls.push('connect'); return ok({ machineCode: 'SQ-T-1' }); },
    heartbeat: () => { calls.push('heartbeat'); return ok({ reportOutcomes: [] }); },
    status: () => { calls.push('status'); return ok({}); },
    events: () => { calls.push('events'); return ok({}); },
    pollCommands: () => { calls.push('poll'); return ok({ commands: [], nextPollSeconds: 2 }); },
    ack: () => ok({}),
    report: () => ok({}),
  };
  return { api: api as unknown as SnackQuestMachineClient, calls };
}

async function agentWith(clock: FakeClock, board: FakeM109eBoard, bus: FakeM109eBus, api: SnackQuestMachineClient) {
  void board;
  const protocol = new M109eProtocolClient(bus, { now: () => clock.now() });
  const slots = new SlotMap([{ slotId: 'b1-m07', motorType: 0x03, curtainMode: 2 }]);
  const journal = await Journal.open(new MemoryJournalStorage());
  const driver = new DispenseDriver(protocol, journal, slots, clock, { policy: CONSERVATIVE_POLICY, resultsPersistUntilRead: false });
  return new M109eMachineAgent(api, protocol, slots, journal, driver, { manufacturerMachineId: 'm-1', doorInput: null, wallNow: () => clock.now() });
}

describe('agent cadence', () => {
  it('polls for orders every cycle but sends a heartbeat at most every 30 s — inside Snack Quest’s 12 a minute', async () => {
    const clock = new FakeClock();
    const bus = new FakeM109eBus();
    const board = bus.add(new FakeM109eBoard(1, ID, clock));
    const { api, calls } = fakeApi();
    const agent = await agentWith(clock, board, bus, api);

    // Two minutes of cycling every 2 s, as the agent does while orders come in.
    for (let i = 0; i < 60; i += 1) {
      await agent.cycle();
      clock.advance(2_000);
    }
    const count = (name: string) => calls.filter((call) => call === name).length;
    expect(count('poll')).toBe(60);
    expect(count('heartbeat')).toBeGreaterThanOrEqual(4);
    expect(count('heartbeat')).toBeLessThanOrEqual(5);
    // An unchanged machine reports its status on the same slow cadence.
    expect(count('status')).toBeLessThanOrEqual(5);
  });

  it('reports a status change at once, without waiting for the interval', async () => {
    const clock = new FakeClock();
    const bus = new FakeM109eBus();
    const board = bus.add(new FakeM109eBoard(1, ID, clock));
    const { api, calls } = fakeApi();
    const agent = await agentWith(clock, board, bus, api);

    await agent.cycle();
    clock.advance(2_000);
    await agent.cycle();
    const before = calls.filter((call) => call === 'status').length;
    bus.boards.delete(1); // the board stops answering
    clock.advance(2_000);
    await agent.cycle();
    expect(calls.filter((call) => call === 'status').length).toBe(before + 1);
  });
});
