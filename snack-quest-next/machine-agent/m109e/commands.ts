import { encodeRequest, s16, u16, FrameError, DATA_LENGTH } from './frame';

/**
 * The M109E commands the agent uses, as documented (§5). Each has a
 * request builder (host → board) and a decoder for the reply's 16 data
 * bytes (`Z1` is `data[0]`). `FFH` (set board address) is deliberately
 * absent: it is a broadcast, its frame layout is contradictory in the
 * document (D4, Q13), and nothing at runtime should ever send it.
 */
export const CMD = {
  GET_ID: 0x01,
  MOTOR_POLL: 0x03,
  MOTOR_RUN: 0x05,
  READ_TEMPERATURE: 0x07,
  WRITE_OUTPUT: 0x08,
  READ_INPUTS: 0x09,
  CURTAIN_POWER: 0x0b,
  CURTAIN_STATE: 0x0c,
  CURTAIN_TIMER: 0x0d,
  READ_HUMIDITY: 0x10,
  READ_SWITCH: 0x2a,
  READ_ROW_SWITCHES: 0x2b,
} as const;

export type CommandCode = (typeof CMD)[keyof typeof CMD];

/** Commands that only read: safe to repeat after a lost reply. Everything else changes the machine and is never repeated blindly. */
export const READ_ONLY_COMMANDS: ReadonlySet<number> = new Set([CMD.GET_ID, CMD.MOTOR_POLL, CMD.READ_TEMPERATURE, CMD.READ_INPUTS, CMD.CURTAIN_STATE, CMD.CURTAIN_TIMER, CMD.READ_HUMIDITY, CMD.READ_SWITCH, CMD.READ_ROW_SWITCHES]);

/**
 * The document gives `05H Y1` as 0–59 but reads back 0–99 elsewhere
 * (D1, Q3). Runs are limited to 0–59 until the manufacturer says
 * otherwise; switch reads accept 0–99.
 */
export const MAX_RUN_MOTOR_INDEX = 59;
export const MAX_READ_MOTOR_INDEX = 99;

function inRange(value: number, min: number, max: number, what: string): void {
  if (!Number.isInteger(value) || value < min || value > max) throw new FrameError('argument', `${what} must be ${min}–${max}, got ${value}`);
}

// ─── requests ────────────────────────────────────────────────────────

/** Light-curtain modes (`05H Y3`): 0 ignore; 1 self-test, stop at in-position; 2 self-test, stop as soon as a drop is seen. */
export type CurtainMode = 0 | 1 | 2;

export interface MotorRunParams {
  motor: number;
  /** `Y2`, 0x00–0x0E — solenoid, 2-/3-wire motor, lock, belt, hook… per lane (the lane's wiring decides it). */
  motorType: number;
  curtainMode: CurtainMode;
  /** `Y4`, tenths of a second, 2–50 (0.2–5 s). 0 lets the board use its default (1.5 s). */
  switchDelayTenths: number;
  /** `Y6`, tenths of a second, 1–250 (0.1–25 s). 0 = board default, 7 s. */
  timeoutTenths: number;
  /** `Y7`, tenths of a second, 1–100 (timed locks). 0 = board default. Which of Y6/Y7 carries it is contradictory in the document (D3, Q12). */
  lockTimeTenths: number;
}

export const request = {
  getId: (board: number) => encodeRequest(board, CMD.GET_ID),
  motorPoll: (board: number) => encodeRequest(board, CMD.MOTOR_POLL),
  motorRun: (board: number, params: MotorRunParams) => {
    inRange(params.motor, 0, MAX_RUN_MOTOR_INDEX, 'motor index');
    inRange(params.motorType, 0x00, 0x0e, 'motor type');
    inRange(params.curtainMode, 0, 2, 'curtain mode');
    if (params.switchDelayTenths !== 0) inRange(params.switchDelayTenths, 2, 50, 'switch delay (tenths)');
    inRange(params.timeoutTenths, 0, 250, 'timeout (tenths)');
    inRange(params.lockTimeTenths, 0, 100, 'lock time (tenths)');
    return encodeRequest(board, CMD.MOTOR_RUN, [params.motor, params.motorType, params.curtainMode, params.switchDelayTenths, 0, params.timeoutTenths, params.lockTimeTenths]);
  },
  readTemperature: (board: number) => encodeRequest(board, CMD.READ_TEMPERATURE),
  writeOutput: (board: number, index: number, on: boolean) => {
    // The number of outputs is contradictory (4, 5 names, or 0–6: D2, Q11); accept the widest documented range.
    inRange(index, 0, 6, 'output index');
    return encodeRequest(board, CMD.WRITE_OUTPUT, [index, on ? 1 : 0]);
  },
  readInputs: (board: number) => encodeRequest(board, CMD.READ_INPUTS),
  curtainPower: (board: number, on: boolean) => encodeRequest(board, CMD.CURTAIN_POWER, [on ? 1 : 0]),
  curtainState: (board: number) => encodeRequest(board, CMD.CURTAIN_STATE),
  curtainTimer: (board: number) => encodeRequest(board, CMD.CURTAIN_TIMER),
  readHumidity: (board: number) => encodeRequest(board, CMD.READ_HUMIDITY),
  readSwitch: (board: number, motor: number) => {
    inRange(motor, 0, MAX_READ_MOTOR_INDEX, 'motor index');
    return encodeRequest(board, CMD.READ_SWITCH, [motor]);
  },
  readRowSwitches: (board: number, row: number) => {
    inRange(row, 0, 9, 'row');
    return encodeRequest(board, CMD.READ_ROW_SWITCHES, [row]);
  },
};

// ─── replies (16 data bytes; Z1 = data[0]) ───────────────────────────

function data16(data: Uint8Array): Uint8Array {
  if (data.length !== DATA_LENGTH) throw new FrameError('length', `reply data must be ${DATA_LENGTH} bytes, got ${data.length}`);
  return data;
}

export interface BoardId {
  /** The 12 raw bytes, as hex. Their format is undocumented (Q8), so nothing parses them further. */
  hex: string;
  bytes: number[];
}

export type MotorState = 'idle' | 'running' | 'finished';

export interface MotorPoll {
  /** `Z1`; `null` for a value outside 0–2 (undocumented). */
  state: MotorState | null;
  rawState: number;
  /** `Z2`, the motor number of the current or last run. */
  motor: number;
  /** `Z3`, see `MOTOR_RESULTS`. Only meaningful when `state === 'finished'`. */
  result: number;
  peakCurrentMa: number;
  averageCurrentMa: number;
  runTimeMs: number;
  /** `Z10`: 0 = the curtain saw nothing fall; 1–200 = ms the product took to pass it. */
  dropMs: number;
}

export type MotorRunReply = 'started' | 'invalid_motor' | 'another_motor_running' | 'result_not_cleared' | 'undocumented';

export const decode = {
  getId(data: Uint8Array): BoardId {
    const bytes = Array.from(data16(data).subarray(0, 12));
    return { bytes, hex: bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join('') };
  },
  motorPoll(data: Uint8Array): MotorPoll {
    const d = data16(data);
    const states: Record<number, MotorState> = { 0: 'idle', 1: 'running', 2: 'finished' };
    return {
      state: states[d[0]] ?? null,
      rawState: d[0],
      motor: d[1],
      result: d[2],
      peakCurrentMa: u16(d[3], d[4]),
      averageCurrentMa: u16(d[5], d[6]),
      runTimeMs: u16(d[7], d[8]),
      dropMs: d[9],
    };
  },
  motorRun(data: Uint8Array): MotorRunReply {
    const replies: Record<number, MotorRunReply> = { 0: 'started', 1: 'invalid_motor', 2: 'another_motor_running', 3: 'result_not_cleared' };
    return replies[data16(data)[0]] ?? 'undocumented';
  },
  /** Degrees Celsius, or `null` when the board reports −50.0 (no sensor fitted). */
  readTemperature(data: Uint8Array): number | null {
    const d = data16(data);
    const tenths = s16(d[0], d[1]);
    return tenths === -500 ? null : tenths / 10;
  },
  /** Confirms the output was switched: `Z2` is the requested state plus 0xF0. Anything else throws. */
  writeOutput(data: Uint8Array, expected: { index: number; on: boolean }): void {
    const d = data16(data);
    if (d[0] !== expected.index || d[1] !== 0xf0 + (expected.on ? 1 : 0)) {
      throw new FrameError('argument', `output reply ${d[0]}/${d[1].toString(16)} does not confirm output ${expected.index} ${expected.on ? 'on' : 'off'}`);
    }
  },
  /** DI1–DI4; `true` = connected (closed). */
  readInputs(data: Uint8Array): [boolean, boolean, boolean, boolean] {
    const d = data16(data);
    return [d[0] === 1, d[1] === 1, d[2] === 1, d[3] === 1];
  },
  curtainState(data: Uint8Array): { blocked: boolean } {
    return { blocked: data16(data)[0] === 1 };
  },
  curtainTimer(data: Uint8Array): { blockedMs: number } {
    return { blockedMs: data16(data)[0] };
  },
  readHumidity(data: Uint8Array): { humidityPct: number; celsius: number; fresh: boolean } {
    const d = data16(data);
    return { humidityPct: d[0], celsius: d[1], fresh: d[2] === 1 };
  },
  readSwitch(data: Uint8Array): 'open' | 'closed' | 'read_failed' | 'undocumented' {
    return (['open', 'closed', 'read_failed'] as const)[data16(data)[0]] ?? 'undocumented';
  },
  /** `Z1–Z11` for one row (the document returns 11 values for rows that appear to hold 10 motors — D8). */
  readRowSwitches(data: Uint8Array): ('open' | 'closed' | 'read_failed' | 'undocumented')[] {
    return Array.from(data16(data).subarray(0, 11), (value) => (['open', 'closed', 'read_failed'] as const)[value] ?? 'undocumented');
  },
};
