import { describe, expect, it } from 'vitest';
import { FakeClock } from '@/machine-agent/agent/clock';
import { FakeM109eBoard, FakeM109eBus, type FakeBoardOptions } from '@/machine-agent/transport/fakeM109e';
import { FaultInjectingTransport } from '@/machine-agent/transport/faultInjection';
import { M109eProtocolClient } from '@/machine-agent/m109e/protocolClient';
import { CMD, type MotorPoll } from '@/machine-agent/m109e/commands';
import { SlotMap, SlotMapError } from '@/machine-agent/m109e/slotMap';
import { CONSERVATIVE_POLICY, outcomeOfRun, type OutcomePolicy } from '@/machine-agent/m109e/outcomeMapper';
import { Journal, JournalCorruptError, MemoryJournalStorage } from '@/machine-agent/journal/journal';
import { DispenseDriver, type DispenseDriverOptions } from '@/machine-agent/m109e/dispenseDriver';

const ID = [0x00, 0x64, 0x00, 0x3b, 0x04, 0x47, 0x36, 0x32, 0x33, 0x38, 0x36, 0x39];
const SLOTS = [
  { slotId: 'b1-m07', motorType: 0x03, curtainMode: 2 as const },
  { slotId: 'b1-m08', motorType: 0x03, curtainMode: 2 as const },
  { slotId: 'b1-m09', motorType: 0x03, curtainMode: 0 as const },
];

async function setup(options: { board?: Partial<FakeBoardOptions>; driver?: Partial<DispenseDriverOptions>; storage?: MemoryJournalStorage; clock?: FakeClock; bus?: FakeM109eBus } = {}) {
  const clock = options.clock ?? new FakeClock();
  const bus = options.bus ?? new FakeM109eBus();
  const board = bus.boards.get(1) ?? bus.add(new FakeM109eBoard(1, ID, clock, options.board ?? {}));
  const faults = new FaultInjectingTransport(bus);
  const client = new M109eProtocolClient(faults, { now: () => clock.now() });
  const storage = options.storage ?? new MemoryJournalStorage();
  const journal = await Journal.open(storage);
  const driver = new DispenseDriver(client, journal, new SlotMap(SLOTS), clock, { policy: CONSERVATIVE_POLICY, resultsPersistUntilRead: false, ...options.driver });
  return { clock, bus, board, faults, client, storage, journal, driver };
}

async function acked(journal: Journal, commandId: string, slotId: string) {
  await journal.record({ t: 'received', commandId, type: 'dispense', slotId, expiresAt: '2026-01-01T09:00:00Z', at: 0 });
  await journal.record({ t: 'acked', commandId, at: 0 });
}

const motorRunsSent = (bus: FakeM109eBus) => bus.written.filter((frame) => frame[1] === CMD.MOTOR_RUN).length;

describe('journal', () => {
  it('replays to the same state, ignores a torn last line, and refuses a damaged line elsewhere', async () => {
    const storage = new MemoryJournalStorage();
    const journal = await Journal.open(storage);
    await acked(journal, 'c1', 'b1-m07');
    await journal.record({ t: 'run_pending', commandId: 'c1', board: 1, motor: 7, at: 1 });
    await journal.record({ t: 'result', commandId: 'c1', board: null, outcome: { status: 'unknown', reason: 'x' }, at: 2 });
    await journal.record({ t: 'report_owed', commandId: 'c1', report: { status: 'unknown', eventId: 'e1', occurredAt: 't', failureReason: 'x' }, at: 3 });
    storage.crashMidWrite();

    const replayed = await Journal.open(storage);
    expect(replayed.get('c1')).toMatchObject({ phase: 'result', board: 1, motor: 7, slotId: 'b1-m07', outcome: { status: 'unknown' } });
    expect(replayed.owedReports()).toEqual([{ commandId: 'c1', report: expect.objectContaining({ eventId: 'e1' }) }]);
    await replayed.record({ t: 'report_accepted', commandId: 'c1', eventId: 'e1', httpStatus: 200, at: 4 });
    expect(replayed.owedReports()).toEqual([]);
    expect(replayed.lastOutcome('c1')).toMatchObject({ status: 'unknown', eventId: 'e1' });

    const damaged = new MemoryJournalStorage();
    damaged.text = '{"t":"acked","commandId":"c1","at":0}\n{broken\n{"t":"acked","commandId":"c2","at":0}\n';
    await expect(Journal.open(damaged)).rejects.toBeInstanceOf(JournalCorruptError);
  });
});

describe('slot map', () => {
  it('accepts b<board>-m<NN> lanes and refuses anything it would have to guess about', () => {
    const map = new SlotMap(SLOTS);
    expect(map.get('b1-m07')).toMatchObject({ board: 1, run: { motor: 7, curtainMode: 2, switchDelayTenths: 15 }, completionDeadlineMs: 10_000 });
    expect(map.withoutCurtain).toEqual(['b1-m09']);
    expect(map.boards()).toEqual([1]);
    for (const bad of [
      [{ slotId: 'A01', motorType: 3, curtainMode: 2 }],
      [{ slotId: 'b9-m01', motorType: 3, curtainMode: 2 }],
      [{ slotId: 'b1-m60', motorType: 3, curtainMode: 2 }],
      [{ slotId: 'b1-m01', motorType: 0x0f, curtainMode: 2 }],
      [{ slotId: 'b1-m01', motorType: 3, curtainMode: 3 }],
      [{ slotId: 'b1-m01', motorType: 3, curtainMode: 2 }, { slotId: 'b1-m01', motorType: 3, curtainMode: 2 }],
    ]) {
      expect(() => new SlotMap(bad as never)).toThrow(SlotMapError);
    }
  });
});

describe('outcome mapper (M109E audit §5.3)', () => {
  const poll = (result: number, dropMs: number, motor = 7): MotorPoll => ({ state: 'finished', rawState: 2, motor, result, peakCurrentMa: 0, averageCurrentMa: 0, runTimeMs: 0, dropMs });
  const certain: OutcomePolicy = { curtainNegativeIsCertain: true };

  it('calls anything the curtain saw a dispense, even with a fault', () => {
    expect(outcomeOfRun(poll(0x00, 35), 7, 2, CONSERVATIVE_POLICY)).toMatchObject({ status: 'dispensed', faults: [] });
    expect(outcomeOfRun(poll(0x01, 35), 7, 2, CONSERVATIVE_POLICY)).toMatchObject({ status: 'dispensed', faults: ['m109e_overcurrent'] });
  });

  it('never refunds on a curtain negative until S5 has passed', () => {
    for (const result of [0x01, 0x02, 0x03, 0x05, 0x0a]) {
      expect(outcomeOfRun(poll(result, 0), 7, 1, CONSERVATIVE_POLICY).status).toBe('unknown');
    }
    expect(outcomeOfRun(poll(0x03, 0), 7, 1, certain)).toMatchObject({ status: 'failed', failureCode: 'no_product' });
    expect(outcomeOfRun(poll(0x01, 0), 7, 1, certain)).toMatchObject({ status: 'failed', failureCode: 'jam' });
  });

  it('treats a failed curtain self-test as certainly not run, and a curtain-less lane or the wrong motor as unknown', () => {
    expect(outcomeOfRun(poll(0x04, 0), 7, 2, CONSERVATIVE_POLICY)).toMatchObject({ status: 'failed', failureCode: 'sensor_failure' });
    expect(outcomeOfRun(poll(0x00, 0), 7, 0, certain).status).toBe('unknown');
    expect(outcomeOfRun(poll(0x00, 35, 8), 7, 2, certain).status).toBe('unknown');
    expect(outcomeOfRun(poll(0x00, 0), 7, 2, certain).status).toBe('unknown');
  });
});

describe('dispense driver', () => {
  it('runs a stocked lane once and reports it dispensed', async () => {
    const { board, bus, journal, driver } = await setup();
    board.load(7, 3);
    await acked(journal, 'c1', 'b1-m07');
    expect(await driver.execute('c1')).toMatchObject({ status: 'dispensed' });
    expect(board.dropped).toEqual([7]);
    expect(motorRunsSent(bus)).toBe(1);
    expect(journal.get('c1')?.phase).toBe('result');
  });

  it('refuses to execute a command twice, or one that was never acknowledged', async () => {
    const { board, bus, journal, driver } = await setup();
    board.load(7, 3);
    await acked(journal, 'c1', 'b1-m07');
    await driver.execute('c1');
    await expect(driver.execute('c1')).rejects.toThrow(/only an acknowledged/);
    await journal.record({ t: 'received', commandId: 'c2', type: 'dispense', slotId: 'b1-m07', expiresAt: 'x', at: 0 });
    await expect(driver.execute('c2')).rejects.toThrow(/only an acknowledged/);
    expect(board.rotations).toEqual([7]);
    expect(motorRunsSent(bus)).toBe(1);
  });

  it('reports an empty lane as unknown under the conservative policy, and as failed once S5 has passed', async () => {
    const conservative = await setup();
    await acked(conservative.journal, 'c1', 'b1-m07');
    expect(await conservative.driver.execute('c1')).toMatchObject({ status: 'unknown' });

    const certain = await setup({ driver: { policy: { curtainNegativeIsCertain: true } } });
    await acked(certain.journal, 'c1', 'b1-m07');
    expect(await certain.driver.execute('c1')).toMatchObject({ status: 'failed', failureCode: 'no_product' });
    expect(certain.board.rotations).toEqual([7]);
  });

  it('fails without touching a motor for an unmapped slot or an unreachable board', async () => {
    const { bus, board, journal, driver } = await setup();
    await acked(journal, 'c1', 'A01');
    expect(await driver.execute('c1')).toMatchObject({ status: 'failed', failureCode: 'm109e_unknown_slot' });
    bus.boards.delete(1);
    await acked(journal, 'c2', 'b1-m07');
    expect(await driver.execute('c2')).toMatchObject({ status: 'failed', failureCode: 'machine_offline' });
    expect(motorRunsSent(bus)).toBe(0);
    expect(board.rotations).toEqual([]);
  });

  it('never sends the run a second time when its reply is lost after the motor started', async () => {
    const { board, bus, faults, journal, driver } = await setup();
    board.load(7, 3);
    faults.inject('drop_reply', CMD.MOTOR_RUN);
    await acked(journal, 'c1', 'b1-m07');
    expect(await driver.execute('c1')).toMatchObject({ status: 'dispensed' });
    expect(motorRunsSent(bus)).toBe(1);
    expect(board.rotations).toEqual([7]);
    expect(board.dropped).toEqual([7]);
  });

  it('calls a lost run request unknown — never retries it — while the result-clearing rule is unconfirmed', async () => {
    const { board, bus, faults, journal, driver } = await setup();
    board.load(7, 3);
    faults.inject('drop_request', CMD.MOTOR_RUN);
    await acked(journal, 'c1', 'b1-m07');
    expect(await driver.execute('c1')).toMatchObject({ status: 'unknown', reason: expect.stringMatching(/Q1, S7/) });
    expect(motorRunsSent(bus)).toBe(0);
    expect(board.rotations).toEqual([]);
  });

  it('retries a lost run request once results are proven to persist until read (S7)', async () => {
    const { board, bus, faults, journal, driver } = await setup({ driver: { resultsPersistUntilRead: true } });
    board.load(7, 3);
    faults.inject('drop_request', CMD.MOTOR_RUN);
    await acked(journal, 'c1', 'b1-m07');
    expect(await driver.execute('c1')).toMatchObject({ status: 'dispensed' });
    expect(motorRunsSent(bus)).toBe(1);
    expect(board.rotations).toEqual([7]);
  });

  it('calls a lost reply unknown when a timer already cleared the result, and never runs again', async () => {
    const { board, bus, faults, journal, driver, clock } = await setup({ board: { resultClearing: { kind: 'timer', afterMs: 0 }, runMs: 0 } });
    board.load(7, 3);
    faults.inject('drop_reply', CMD.MOTOR_RUN);
    await acked(journal, 'c1', 'b1-m07');
    clock.advance(1);
    expect(await driver.execute('c1')).toMatchObject({ status: 'unknown' });
    expect(motorRunsSent(bus)).toBe(1);
    expect(board.rotations).toEqual([7]);
  });

  it('reports a failed curtain self-test as failed with no rotation', async () => {
    const { board, journal, driver } = await setup({ board: { requireCurtainPower: true } });
    board.load(7, 3);
    await acked(journal, 'c1', 'b1-m07');
    expect(await driver.execute('c1')).toMatchObject({ status: 'failed', failureCode: 'sensor_failure' });
    expect(board.rotations).toEqual([]);
  });

  it('reports a curtain-less lane as unknown even when the product fell', async () => {
    const { board, journal, driver } = await setup();
    board.load(9, 3);
    await acked(journal, 'c1', 'b1-m09');
    expect(await driver.execute('c1')).toMatchObject({ status: 'unknown' });
    expect(board.dropped).toEqual([9]);
  });

  it('runs commands back to back, reading each result before the next run', async () => {
    const { board, bus, journal, driver } = await setup();
    board.load(7, 3);
    board.load(8, 3);
    for (const [id, slot] of [['c1', 'b1-m07'], ['c2', 'b1-m08'], ['c3', 'b1-m07']]) {
      await acked(journal, id, slot);
      expect(await driver.execute(id)).toMatchObject({ status: 'dispensed' });
    }
    expect(board.dropped).toEqual([7, 8, 7]);
    expect(motorRunsSent(bus)).toBe(3);
  });
});

describe('dispense driver crash recovery', () => {
  it('fails a command that was acknowledged but never started, without running it', async () => {
    const storage = new MemoryJournalStorage();
    const first = await setup({ storage });
    first.board.load(7, 3);
    await acked(first.journal, 'c1', 'b1-m07');
    // crash: the agent restarts
    const second = await setup({ storage, clock: first.clock, bus: first.bus });
    expect(await second.driver.recover()).toEqual([{ commandId: 'c1', outcome: expect.objectContaining({ status: 'failed' }) }]);
    expect(first.board.rotations).toEqual([]);
    await expect(second.driver.execute('c1')).rejects.toThrow();
  });

  it('attributes the board’s result to a run that was in flight at the crash, and never runs it again', async () => {
    const storage = new MemoryJournalStorage();
    const first = await setup({ storage });
    first.board.load(7, 3);
    await acked(first.journal, 'c1', 'b1-m07');
    // Crash right after the run frame went out: run_pending is on disk, the motor is turning.
    await first.journal.record({ t: 'run_pending', commandId: 'c1', board: 1, motor: 7, at: first.clock.now() });
    expect(await first.client.motorRun(1, new SlotMap(SLOTS).get('b1-m07')!.run)).toBe('started');

    const second = await setup({ storage, clock: first.clock, bus: first.bus });
    expect(await second.driver.recover()).toEqual([{ commandId: 'c1', outcome: expect.objectContaining({ status: 'dispensed' }) }]);
    expect(first.board.rotations).toEqual([7]);
    expect(motorRunsSent(first.bus)).toBe(1);
    expect(second.journal.get('c1')?.phase).toBe('result');
  });

  it('calls an in-flight run unknown when the board lost its result (power cut), and never runs it again', async () => {
    const storage = new MemoryJournalStorage();
    const first = await setup({ storage });
    first.board.load(7, 3);
    await acked(first.journal, 'c1', 'b1-m07');
    await first.journal.record({ t: 'run_pending', commandId: 'c1', board: 1, motor: 7, at: first.clock.now() });
    await first.client.motorRun(1, new SlotMap(SLOTS).get('b1-m07')!.run);
    first.board.powerCut();

    const second = await setup({ storage, clock: first.clock, bus: first.bus });
    expect(await second.driver.recover()).toEqual([{ commandId: 'c1', outcome: expect.objectContaining({ status: 'unknown' }) }]);
    expect(motorRunsSent(first.bus)).toBe(1);
  });

  it('survives a crash mid-write of the run_pending entry: the torn entry never happened, so nothing ran', async () => {
    const storage = new MemoryJournalStorage();
    const first = await setup({ storage });
    await acked(first.journal, 'c1', 'b1-m07');
    storage.crashMidWrite('{"t":"run_pending","commandId":"c1","bo');
    const second = await setup({ storage, clock: first.clock, bus: first.bus });
    expect(await second.driver.recover()).toEqual([{ commandId: 'c1', outcome: expect.objectContaining({ status: 'failed' }) }]);
    expect(first.board.rotations).toEqual([]);
  });

  it('one command turns a motor at most once, whatever single serial fault hits it', async () => {
    for (const fault of ['drop_request', 'drop_reply', 'corrupt_reply', 'truncate_reply', 'wrong_echo', 'wrong_address'] as const) {
      for (const persist of [false, true]) {
        const { board, faults, journal, driver } = await setup({ driver: { resultsPersistUntilRead: persist } });
        board.load(7, 5);
        faults.inject(fault, CMD.MOTOR_RUN);
        await acked(journal, 'c1', 'b1-m07');
        const outcome = await driver.execute('c1');
        expect(board.rotations.length, `${fault}, persist=${persist}`).toBeLessThanOrEqual(1);
        if (board.rotations.length === 0) expect(outcome.status).not.toBe('dispensed');
        if (outcome.status === 'dispensed') expect(board.dropped).toEqual([7]);
      }
    }
  });
});
