import { describe, expect, it } from 'vitest';
import { FakeClock } from '@/machine-agent/agent/clock';
import { FakeM109eBoard, FakeM109eBus } from '@/machine-agent/transport/fakeM109e';
import { FaultInjectingTransport } from '@/machine-agent/transport/faultInjection';
import { M109eProtocolClient, BoardUnreachableError, type FrameLogEntry } from '@/machine-agent/m109e/protocolClient';
import { CMD, type MotorRunParams } from '@/machine-agent/m109e/commands';
import type { SerialTransport } from '@/machine-agent/transport/serialTransport';

const ID = [0x00, 0x64, 0x00, 0x3b, 0x04, 0x47, 0x36, 0x32, 0x33, 0x38, 0x36, 0x39];
const RUN: MotorRunParams = { motor: 7, motorType: 0x03, curtainMode: 2, switchDelayTenths: 15, timeoutTenths: 0, lockTimeTenths: 0 };

function setup(options: ConstructorParameters<typeof FakeM109eBoard>[3] = {}) {
  const clock = new FakeClock();
  const bus = new FakeM109eBus();
  const board = bus.add(new FakeM109eBoard(1, ID, clock, options));
  const faults = new FaultInjectingTransport(bus);
  const log: FrameLogEntry[] = [];
  const client = new M109eProtocolClient(faults, { log: (entry) => log.push(entry), now: () => clock.now() });
  return { clock, bus, board, faults, client, log };
}

describe('fake M109E board', () => {
  it('runs one motor at a time, and refuses a new run until the last result is read', async () => {
    const { clock, board, client } = setup();
    board.load(7, 2);
    board.load(8, 2);
    expect(await client.motorRun(1, RUN)).toBe('started');
    expect(await client.motorRun(1, { ...RUN, motor: 8 })).toBe('another_motor_running');
    expect((await client.motorPoll(1)).state).toBe('running');
    clock.advance(2000);
    expect(await client.motorRun(1, { ...RUN, motor: 8 })).toBe('result_not_cleared');
    const done = await client.motorPoll(1);
    expect(done).toMatchObject({ state: 'finished', motor: 7, result: 0x00, dropMs: 35 });
    expect(board.dropped).toEqual([7]);
    // Read once: cleared (the on_read reading of Q1).
    expect((await client.motorPoll(1)).state).toBe('idle');
    expect(await client.motorRun(1, { ...RUN, motor: 8 })).toBe('started');
    expect(board.rotations).toEqual([7, 8]);
  });

  it('runs an empty lane to its timeout with nothing seen falling', async () => {
    const { clock, board, client } = setup();
    expect(await client.motorRun(1, RUN)).toBe('started');
    clock.advance(6999);
    expect((await client.motorPoll(1)).state).toBe('running');
    clock.advance(1);
    expect(await client.motorPoll(1)).toMatchObject({ state: 'finished', result: 0x03, dropMs: 0 });
    expect(board.dropped).toEqual([]);
  });

  it('fails the curtain self-test without turning the motor, and refuses an out-of-range motor', async () => {
    const { clock, board, client } = setup({ requireCurtainPower: true });
    board.load(7, 1);
    expect(await client.motorRun(1, RUN)).toBe('started');
    clock.advance(10);
    expect(await client.motorPoll(1)).toMatchObject({ state: 'finished', result: 0x04 });
    expect(board.rotations).toEqual([]);
    expect(await client.curtainPower(1, true)).toBe(true);
    expect(await client.motorRun(1, RUN)).toBe('started');
    expect(board.rotations).toEqual([7]);
    const narrow = setup({ maxRunMotorIndex: 5 });
    expect(await narrow.client.motorRun(1, RUN)).toBe('invalid_motor');
  });

  it('can clear a result by itself (the timer reading of Q1), losing it if nobody read it', async () => {
    const { clock, board, client } = setup({ resultClearing: { kind: 'timer', afterMs: 5000 } });
    board.load(7, 1);
    await client.motorRun(1, RUN);
    clock.advance(1500 + 5000);
    expect((await client.motorPoll(1)).state).toBe('idle');
    expect(board.dropped).toEqual([7]);
  });

  it('reports sensors, the door input, and outputs', async () => {
    const { board, client } = setup();
    expect(await client.readTemperature(1)).toBe(4.5);
    board.temperatureTenths = null;
    expect(await client.readTemperature(1)).toBeNull();
    expect((await client.readInputs(1))[0]).toBe(true);
    board.setDoor(true);
    expect((await client.readInputs(1))[0]).toBe(false);
    expect(await client.writeOutput(1, 3, true)).toBe(true);
    expect(board.outputs.get(3)).toBe(true);
    expect((await client.getId(1)).hex).toBe('0064003B0447363233383639');
  });
});

describe('M109E protocol client', () => {
  it('retries a read after a lost or bad reply, up to three attempts', async () => {
    const { faults, client, log } = setup();
    faults.inject('drop_reply', CMD.READ_TEMPERATURE);
    faults.inject('corrupt_reply', CMD.READ_TEMPERATURE);
    expect(await client.readTemperature(1)).toBe(4.5);
    expect(log.filter((entry) => entry.direction === 'tx' && entry.command === CMD.READ_TEMPERATURE)).toHaveLength(3);
    expect(log.some((entry) => entry.note?.includes('rejected reply (crc)'))).toBe(true);
    for (let i = 0; i < 3; i += 1) faults.inject('drop_request', CMD.READ_TEMPERATURE);
    await expect(client.readTemperature(1)).rejects.toBeInstanceOf(BoardUnreachableError);
  });

  it('never sends a motor run twice: a lost reply is "no_reply", and the motor did turn', async () => {
    const { board, bus, faults, client } = setup();
    board.load(7, 1);
    faults.inject('drop_reply', CMD.MOTOR_RUN);
    expect(await client.motorRun(1, RUN)).toBe('no_reply');
    expect(bus.written.filter((frame) => frame[1] === CMD.MOTOR_RUN)).toHaveLength(1);
    expect(board.rotations).toEqual([7]);
    // A lost request looks identical to the host — and the motor did not turn.
    const other = setup();
    other.board.load(7, 1);
    other.faults.inject('drop_request', CMD.MOTOR_RUN);
    expect(await other.client.motorRun(1, RUN)).toBe('no_reply');
    expect(other.board.rotations).toEqual([]);
  });

  it('rejects a truncated reply, a reply to a different command, and a reply not addressed to the host', async () => {
    const { faults, client, log } = setup();
    faults.inject('truncate_reply', CMD.GET_ID);
    faults.inject('wrong_echo', CMD.GET_ID);
    faults.inject('wrong_address', CMD.GET_ID);
    await expect(client.getId(1)).rejects.toBeInstanceOf(BoardUnreachableError);
    const notes = log.filter((entry) => entry.note).map((entry) => entry.note ?? '');
    expect(notes.some((note) => note.includes('(length)'))).toBe(true);
    expect(notes.some((note) => note.includes('(command)'))).toBe(true);
    expect(notes.some((note) => note.includes('(address)'))).toBe(true);
    expect(await client.getId(1)).toMatchObject({ hex: '0064003B0447363233383639' });
  });

  it('keeps one request on the line at a time and flushes stale input before each', async () => {
    const clock = new FakeClock();
    const bus = new FakeM109eBus();
    bus.add(new FakeM109eBoard(1, ID, clock));
    let inFlight = 0;
    let maxInFlight = 0;
    const events: string[] = [];
    const slow: SerialTransport = {
      async request(frame) {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        events.push(`request ${frame[1].toString(16)}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return bus.request(frame);
      },
      async flushInput() {
        events.push('flush');
      },
      close: () => bus.close(),
    };
    const client = new M109eProtocolClient(slow);
    await Promise.all([client.getId(1), client.readTemperature(1), client.readInputs(1), client.motorPoll(1)]);
    expect(maxInFlight).toBe(1);
    expect(events).toEqual(['flush', 'request 1', 'flush', 'request 7', 'flush', 'request 9', 'flush', 'request 3']);
  });
});
