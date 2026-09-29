import { decodeFrame, encodeFrame, HOST_ADDRESS } from '../m109e/frame';
import { CMD, MAX_READ_MOTOR_INDEX, MAX_RUN_MOTOR_INDEX } from '../m109e/commands';
import type { Clock } from '../agent/clock';
import type { SerialTransport } from './serialTransport';

/**
 * A simulated M109E bus: one or more boards (addresses 1–8) behaving as
 * the document describes — one motor at a time (`05H Z1=2`), a finished
 * result blocks the next run until it is cleared (`Z1=3`), result codes
 * (`Z3`) and light-curtain drop timing (`Z10`), sensors, inputs and
 * outputs. It never initiates; it only answers.
 *
 * What the document leaves open is configurable, so the agent is tested
 * under each reading:
 * - `resultClearing` (Q1): `on_read` — a finished result stays until the
 *   host reads it with `03H`, then the board is idle; `timer` — it also
 *   clears itself after `afterMs`, read or not.
 * - `requireCurtainPower` (Q4): whether modes 1/2 fail their self-test
 *   unless the curtain was powered with `0BH`.
 * - `powerCut()` (Q2): the board forgets everything (the most pessimistic
 *   reading).
 *
 * This is a model of a document, not of the hardware. It proves the
 * agent's logic; only the physical acceptance tests prove the machine.
 */

export interface FakeLane {
  /** Items physically in the lane. */
  stock: number;
  /** A mechanical fault on the next runs until cleared. */
  fault: 'none' | 'jam' | 'unplugged' | 'jam_but_drops';
  /** How long the product takes to pass the curtain, 1–200 ms. */
  dropMs: number;
}

interface Run {
  motor: number;
  startedAt: number;
  finishesAt: number;
  result: number;
  dropMs: number;
  runTimeMs: number;
  peakCurrentMa: number;
  averageCurrentMa: number;
  /** The product leaves the lane when the run finishes; recorded so tests can count real drops. */
  drops: boolean;
}

export interface FakeBoardOptions {
  resultClearing: { kind: 'on_read' } | { kind: 'timer'; afterMs: number };
  requireCurtainPower: boolean;
  /** Normal lane run time (ms) before the product falls. */
  runMs: number;
  maxRunMotorIndex: number;
  /** DI input (1–4) wired to a door switch, if any (unknown until Q9). Closed door = input connected. */
  doorInput: 1 | 2 | 3 | 4 | null;
}

const DEFAULTS: FakeBoardOptions = { resultClearing: { kind: 'on_read' }, requireCurtainPower: false, runMs: 1500, maxRunMotorIndex: MAX_RUN_MOTOR_INDEX, doorInput: 1 };

export class FakeM109eBoard {
  readonly lanes = new Map<number, FakeLane>();
  readonly options: FakeBoardOptions;
  private run: Run | null = null;
  /** The finished run whose result hasn't been cleared yet. */
  private finished: Run | null = null;
  private finishedAt = 0;
  curtainPowered = false;
  curtainWorks = true;
  /** Tenths of a degree; `null` = no sensor (reads −50.0). */
  temperatureTenths: number | null = 45;
  humidity = { pct: 55, celsius: 22, fresh: true };
  readonly inputs: [boolean, boolean, boolean, boolean] = [true, false, false, false];
  readonly outputs = new Map<number, boolean>();
  /** Every product that physically left the machine, in order — what a person would count at the delivery port. */
  readonly dropped: number[] = [];
  /** Every motor that actually turned, in order. */
  readonly rotations: number[] = [];

  constructor(
    readonly address: number,
    readonly id: number[],
    private readonly clock: Clock,
    options: Partial<FakeBoardOptions> = {},
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  lane(motor: number): FakeLane {
    let lane = this.lanes.get(motor);
    if (!lane) {
      lane = { stock: 0, fault: 'none', dropMs: 35 };
      this.lanes.set(motor, lane);
    }
    return lane;
  }

  load(motor: number, stock: number): void {
    this.lane(motor).stock = stock;
  }

  setDoor(open: boolean): void {
    if (this.options.doorInput) this.inputs[this.options.doorInput - 1] = !open;
  }

  /** The board loses power: any run in progress and any uncleared result are gone. A motor mid-run has already done whatever it did. */
  powerCut(): void {
    this.settle();
    this.run = null;
    this.finished = null;
    this.curtainPowered = false;
  }

  /** Answers one request frame; `null` for a frame the board ignores (not addressed to it, or bad CRC — documented as ignored? Q15; treated as silence). */
  handle(request: Uint8Array): Uint8Array | null {
    let frame;
    try {
      frame = decodeFrame(request);
    } catch {
      return null;
    }
    if (frame.address !== this.address) return null;
    this.settle();
    const reply = (data: number[]) => encodeFrame(HOST_ADDRESS, frame.command, data);
    const y = frame.data;
    switch (frame.command) {
      case CMD.GET_ID:
        return reply(this.id);
      case CMD.MOTOR_POLL:
        return reply(this.poll());
      case CMD.MOTOR_RUN:
        return reply([this.start(y[0], y[2], y[5])]);
      case CMD.READ_TEMPERATURE: {
        const tenths = this.temperatureTenths ?? -500;
        const raw = tenths < 0 ? tenths + 0x10000 : tenths;
        return reply([raw >> 8, raw & 0xff]);
      }
      case CMD.WRITE_OUTPUT:
        this.outputs.set(y[0], y[1] === 1);
        return reply([y[0], 0xf0 + (y[1] === 1 ? 1 : 0)]);
      case CMD.READ_INPUTS:
        return reply(this.inputs.map((on) => (on ? 1 : 0)));
      case CMD.CURTAIN_POWER:
        this.curtainPowered = y[0] === 1;
        return reply([y[0]]);
      case CMD.CURTAIN_STATE:
        return reply([0]);
      case CMD.CURTAIN_TIMER:
        return reply([0]);
      case CMD.READ_HUMIDITY:
        return reply([this.humidity.pct, this.humidity.celsius, this.humidity.fresh ? 1 : 0]);
      case CMD.READ_SWITCH:
        return reply([y[0] <= MAX_READ_MOTOR_INDEX && this.lanes.has(y[0]) ? 1 : 0]);
      case CMD.READ_ROW_SWITCHES:
        return reply(Array.from({ length: 11 }, (_, column) => (column < 10 && this.lanes.has(y[0] * 10 + column) ? 1 : 0)));
      default:
        return null;
    }
  }

  /** Moves any run that has finished by now into the finished slot, and applies the timer clearing rule. */
  private settle(): void {
    const now = this.clock.now();
    if (this.run && now >= this.run.finishesAt) {
      this.finished = this.run;
      this.finishedAt = this.run.finishesAt;
      if (this.run.drops) this.dropped.push(this.run.motor);
      this.run = null;
    }
    const clearing = this.options.resultClearing;
    if (this.finished && clearing.kind === 'timer' && now - this.finishedAt >= clearing.afterMs) {
      this.finished = null;
    }
  }

  private start(motor: number, curtainMode: number, timeoutTenths: number): number {
    if (motor > this.options.maxRunMotorIndex) return 1;
    if (this.run) return 2;
    if (this.finished) return 3;
    const now = this.clock.now();
    const timeoutMs = timeoutTenths > 0 ? timeoutTenths * 100 : 7000;
    const lane = this.lane(motor);
    const curtainOk = curtainMode === 0 || (this.curtainWorks && (!this.options.requireCurtainPower || this.curtainPowered));
    const make = (result: number, durationMs: number, drops: boolean, dropMs: number, peak = 900, average = 450): Run => ({
      motor,
      startedAt: now,
      finishesAt: now + durationMs,
      result,
      dropMs: curtainMode === 0 ? 0 : dropMs,
      runTimeMs: durationMs,
      peakCurrentMa: peak,
      averageCurrentMa: average,
      drops,
    });
    if (!curtainOk) {
      // Self-test failed: the run "starts" and immediately finishes with 0x04; the motor never turns.
      this.run = make(0x04, 0, false, 0, 0, 0);
      return 0;
    }
    this.rotations.push(motor);
    if (lane.fault === 'unplugged') {
      this.run = make(0x02, 200, false, 0, 0, 0);
    } else if (lane.fault === 'jam' || (lane.fault === 'jam_but_drops' && lane.stock === 0)) {
      this.run = make(0x01, 600, false, 0, 2500, 1800);
    } else if (lane.fault === 'jam_but_drops') {
      lane.stock -= 1;
      this.run = make(0x01, 600, true, lane.dropMs, 2500, 1800);
    } else if (lane.stock > 0) {
      lane.stock -= 1;
      this.run = make(0x00, curtainMode === 2 ? this.options.runMs : Math.min(this.options.runMs + 300, timeoutMs), true, lane.dropMs);
    } else {
      // Empty lane: runs to the timeout with nothing falling.
      this.run = make(0x03, timeoutMs, false, 0);
    }
    return 0;
  }

  private poll(): number[] {
    if (this.run) return [1, this.run.motor, 0, 0, 0, 0, 0, 0, 0, 0];
    if (this.finished) {
      const r = this.finished;
      if (this.options.resultClearing.kind === 'on_read') this.finished = null;
      return [2, r.motor, r.result, r.peakCurrentMa >> 8, r.peakCurrentMa & 0xff, r.averageCurrentMa >> 8, r.averageCurrentMa & 0xff, r.runTimeMs >> 8, r.runTimeMs & 0xff, r.dropMs];
    }
    return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }
}

/** A serial line with fake boards on it, answering instantly (virtual time). */
export class FakeM109eBus implements SerialTransport {
  readonly boards = new Map<number, FakeM109eBoard>();
  /** Every frame written to the line, in order — the bus-side frame log. */
  readonly written: Uint8Array[] = [];
  private closed = false;

  add(board: FakeM109eBoard): FakeM109eBoard {
    this.boards.set(board.address, board);
    return board;
  }

  async request(frame: Uint8Array): Promise<Uint8Array | null> {
    if (this.closed) throw new Error('serial port closed');
    this.written.push(frame.slice());
    for (const board of this.boards.values()) {
      const reply = board.handle(frame);
      if (reply) return reply;
    }
    return null;
  }

  async flushInput(): Promise<void> {}

  async close(): Promise<void> {
    this.closed = true;
  }
}
