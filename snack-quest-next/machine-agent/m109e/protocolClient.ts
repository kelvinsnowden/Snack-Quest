import { decodeFrame, hex, FrameError, HOST_ADDRESS } from './frame';
import { CMD, decode, request, READ_ONLY_COMMANDS, type BoardId, type MotorPoll, type MotorRunParams, type MotorRunReply } from './commands';
import { DOCUMENTED_TIMING, type SerialTransport } from '../transport/serialTransport';

export interface FrameLogEntry {
  at: number;
  direction: 'tx' | 'rx' | 'none';
  board: number;
  command: number;
  hex: string;
  /** Why a reply was rejected, or why nothing arrived. */
  note?: string;
}

export class BoardUnreachableError extends Error {
  constructor(
    readonly board: number,
    readonly command: number,
    readonly attempts: number,
    readonly lastProblem: string,
  ) {
    super(`board ${board} did not answer command ${hex([command])} after ${attempts} attempt(s): ${lastProblem}`);
    this.name = 'BoardUnreachableError';
  }
}

export interface ProtocolClientOptions {
  timing?: { settleMs: number; timeoutMs: number };
  /** Attempts for read-only commands (default 3). Commands that change the machine are always sent once. */
  readAttempts?: number;
  log?: (entry: FrameLogEntry) => void;
  now?: () => number;
}

/**
 * Talks to M109E boards over one serial line.
 *
 * - One request in flight at a time: calls queue behind each other, as
 *   the document requires (§4.1).
 * - The input is flushed before every request, so a late reply to an
 *   earlier request can't be taken as the answer to this one.
 * - A reply is used only if it is 20 bytes, its CRC is right, it is
 *   addressed to the host and it echoes the command sent. Anything else
 *   is logged and treated as no reply.
 * - Read-only commands are retried (default 3 attempts). **A motor run
 *   (`05H`) is never retried**: a lost reply returns `no_reply`, and the
 *   caller must find out what happened with `03H` — never by sending
 *   `05H` again.
 * - Every frame sent and received is logged as hex.
 */
export class M109eProtocolClient {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly timing: { settleMs: number; timeoutMs: number };
  private readonly readAttempts: number;
  private readonly now: () => number;

  constructor(
    private readonly transport: SerialTransport,
    private readonly options: ProtocolClientOptions = {},
  ) {
    this.timing = options.timing ?? DOCUMENTED_TIMING;
    this.readAttempts = options.readAttempts ?? 3;
    this.now = options.now ?? Date.now;
  }

  getId(board: number): Promise<BoardId> {
    return this.read(board, request.getId(board), (data) => decode.getId(data));
  }

  motorPoll(board: number): Promise<MotorPoll> {
    return this.read(board, request.motorPoll(board), (data) => decode.motorPoll(data));
  }

  readTemperature(board: number): Promise<number | null> {
    return this.read(board, request.readTemperature(board), (data) => decode.readTemperature(data));
  }

  readInputs(board: number): Promise<[boolean, boolean, boolean, boolean]> {
    return this.read(board, request.readInputs(board), (data) => decode.readInputs(data));
  }

  readHumidity(board: number) {
    return this.read(board, request.readHumidity(board), (data) => decode.readHumidity(data));
  }

  readSwitch(board: number, motor: number) {
    return this.read(board, request.readSwitch(board, motor), (data) => decode.readSwitch(data));
  }

  readRowSwitches(board: number, row: number) {
    return this.read(board, request.readRowSwitches(board, row), (data) => decode.readRowSwitches(data));
  }

  /** Starts a motor. Sent exactly once. `no_reply` means the motor may or may not have started. */
  motorRun(board: number, params: MotorRunParams): Promise<MotorRunReply | 'no_reply'> {
    const frame = request.motorRun(board, params);
    return this.exclusive(async () => {
      const outcome = await this.exchange(board, frame);
      return outcome.ok ? decode.motorRun(outcome.data) : 'no_reply';
    });
  }

  /** Switches a digital output; sent once. `false` if the board didn't confirm it. */
  writeOutput(board: number, index: number, on: boolean): Promise<boolean> {
    const frame = request.writeOutput(board, index, on);
    return this.exclusive(async () => {
      const outcome = await this.exchange(board, frame);
      if (!outcome.ok) return false;
      try {
        decode.writeOutput(outcome.data, { index, on });
        return true;
      } catch {
        return false;
      }
    });
  }

  /** Powers the light curtain on or off; sent once. `false` if there was no valid reply. */
  curtainPower(board: number, on: boolean): Promise<boolean> {
    const frame = request.curtainPower(board, on);
    return this.exclusive(async () => (await this.exchange(board, frame)).ok);
  }

  private read<T>(board: number, frame: Uint8Array, parse: (data: Uint8Array) => T): Promise<T> {
    if (!READ_ONLY_COMMANDS.has(frame[1])) throw new Error(`command ${hex([frame[1]])} is not read-only and must not be retried`);
    return this.exclusive(async () => {
      let problem = 'no attempt';
      for (let attempt = 1; attempt <= this.readAttempts; attempt += 1) {
        const outcome = await this.exchange(board, frame);
        if (outcome.ok) return parse(outcome.data);
        problem = outcome.problem;
      }
      throw new BoardUnreachableError(board, frame[1], this.readAttempts, problem);
    });
  }

  private async exchange(board: number, frame: Uint8Array): Promise<{ ok: true; data: Uint8Array } | { ok: false; problem: string }> {
    const command = frame[1];
    await this.transport.flushInput();
    this.log({ direction: 'tx', board, command, hex: hex(frame) });
    let reply: Uint8Array | null;
    try {
      reply = await this.transport.request(frame, this.timing);
    } catch (error) {
      const problem = `transport error: ${error instanceof Error ? error.message : String(error)}`;
      this.log({ direction: 'none', board, command, hex: '', note: problem });
      return { ok: false, problem };
    }
    if (!reply) {
      this.log({ direction: 'none', board, command, hex: '', note: `no reply within ${this.timing.timeoutMs} ms` });
      return { ok: false, problem: 'no reply' };
    }
    try {
      const decoded = decodeFrame(reply, { address: HOST_ADDRESS, command });
      this.log({ direction: 'rx', board, command, hex: hex(reply) });
      return { ok: true, data: decoded.data };
    } catch (error) {
      const problem = error instanceof FrameError ? `rejected reply (${error.kind}): ${error.message}` : String(error);
      this.log({ direction: 'rx', board, command, hex: hex(reply), note: problem });
      return { ok: false, problem };
    }
  }

  private log(entry: Omit<FrameLogEntry, 'at'>): void {
    this.options.log?.({ at: this.now(), ...entry });
  }

  /** Runs `fn` after every earlier call has finished — one request on the line at a time. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }
}

export { CMD };
