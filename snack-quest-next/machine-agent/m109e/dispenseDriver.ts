import { BoardUnreachableError, type M109eProtocolClient } from './protocolClient';
import { outcomeOfRefusal, outcomeOfRun, type DispenseOutcome, type OutcomePolicy } from './outcomeMapper';
import type { MotorPoll } from './commands';
import type { SlotMap, Lane } from './slotMap';
import type { Journal } from '../journal/journal';
import type { Clock } from '../agent/clock';

export interface DispenseDriverOptions {
  policy: OutcomePolicy;
  /**
   * Does a finished result stay on the board until the host reads it
   * (Q1, acceptance test S7)? Only when this is known to be true does
   * "lost motor-run reply, board idle" prove the motor never started —
   * and only then is the run sent a second time. **False until S7.**
   */
  resultsPersistUntilRead: boolean;
  /** How often to poll a running motor (default 200 ms). */
  pollIntervalMs?: number;
  /** Explicit "busy / result not cleared" refusals to work through before giving up (default 3). */
  maxRefusals?: number;
}

/**
 * Runs acknowledged dispense commands on the M109E, one at a time, so
 * that one command turns a motor at most once — whatever breaks.
 *
 *   acked → run_pending (on disk) → 05H → run_started → poll 03H → result (on disk)
 *
 * - `run_pending` is flushed to disk before the motor-run frame is sent,
 *   so a crash at any point after it can never lead to a second run.
 * - A lost `05H` reply is never answered with another `05H`. The board is
 *   asked (`03H`) what happened; if it can't say, the outcome is `unknown`
 *   and a person decides (M109E audit §5.4).
 * - An earlier result still on the board is read (and attributed to its
 *   own command through the journal) before a new run, because the board
 *   refuses a run while one is uncleared.
 */
export class DispenseDriver {
  private readonly pollIntervalMs: number;
  private readonly maxRefusals: number;

  constructor(
    private readonly client: M109eProtocolClient,
    private readonly journal: Journal,
    private readonly slots: SlotMap,
    private readonly clock: Clock,
    private readonly options: DispenseDriverOptions,
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 200;
    this.maxRefusals = options.maxRefusals ?? 3;
  }

  /** Executes one acknowledged command. Its outcome is on disk before this returns. */
  async execute(commandId: string): Promise<DispenseOutcome> {
    const record = this.journal.get(commandId);
    if (!record || record.phase !== 'acked') {
      throw new Error(`command ${commandId} is ${record?.phase ?? 'unknown to the journal'}; only an acknowledged, never-run command may be executed`);
    }
    const lane = record.slotId ? this.slots.get(record.slotId) : undefined;
    if (!lane) {
      return this.finish(commandId, null, { status: 'failed', failureCode: 'm109e_unknown_slot', reason: `slot "${record.slotId ?? ''}" is not in this machine's slot map; no motor was touched` });
    }

    for (let refusals = 0; ; ) {
      const ready = await this.prepareBoard(lane.board);
      if (ready !== 'ready') {
        return this.finish(commandId, null, { status: 'failed', failureCode: 'machine_offline', reason: `board ${lane.board} was not ready (${ready}); no motor was touched` });
      }
      await this.journal.record({ t: 'run_pending', commandId, board: lane.board, motor: lane.run.motor, at: this.clock.now() });
      let reply: Awaited<ReturnType<M109eProtocolClient['motorRun']>>;
      try {
        reply = await this.client.motorRun(lane.board, lane.run);
      } catch {
        reply = 'no_reply';
      }
      if (reply === 'started') {
        await this.journal.record({ t: 'run_started', commandId, at: this.clock.now() });
        return this.awaitResult(commandId, lane);
      }
      if (reply === 'no_reply') {
        const settled = await this.afterLostRunReply(commandId, lane);
        if (settled !== 'not_started') return settled;
        refusals += 1; // proven not started (results-persist rule): one more attempt is safe
      } else if (reply === 'another_motor_running' || reply === 'result_not_cleared') {
        await this.journal.record({ t: 'run_refused', commandId, reason: reply, at: this.clock.now() });
        refusals += 1;
      } else {
        await this.journal.record({ t: 'run_refused', commandId, reason: reply, at: this.clock.now() });
        return this.finish(commandId, null, outcomeOfRefusal(reply));
      }
      if (refusals >= this.maxRefusals) {
        return this.finish(commandId, null, { status: 'failed', failureCode: 'machine_offline', reason: `board ${lane.board} kept refusing the run (${reply}); the motor did not turn` });
      }
      await this.clock.sleep(this.pollIntervalMs);
    }
  }

  /**
   * After a restart: settles every command the journal shows was
   * acknowledged but not finished. Acknowledged and never sent → `failed`
   * (certain: `run_pending` is written before any frame). A run that may
   * have started → the board's own result if it still has one for that
   * motor, otherwise `unknown`. Nothing is ever run again.
   */
  async recover(): Promise<{ commandId: string; outcome: DispenseOutcome }[]> {
    const settled: { commandId: string; outcome: DispenseOutcome }[] = [];
    for (const record of this.journal.all()) {
      if (record.type !== 'dispense') continue;
      if (record.phase === 'acked' || record.phase === 'run_refused') {
        // No run in flight: either never sent, or the board's own valid reply said the last attempt didn't start.
        settled.push({ commandId: record.commandId, outcome: await this.finish(record.commandId, null, { status: 'failed', failureCode: 'failed', reason: 'acknowledged, but the agent restarted before running the motor; it will not be run' }) });
      } else if ((record.phase === 'run_pending' || record.phase === 'run_started') && record.board !== null && record.motor !== null) {
        const lane = this.slots.get(record.slotId ?? '');
        const curtainMode = lane?.run.curtainMode ?? 2;
        let poll: MotorPoll | null = null;
        try {
          poll = await this.client.motorPoll(record.board);
          const deadline = this.clock.now() + (lane?.completionDeadlineMs ?? 10_000);
          while (poll.state === 'running' && poll.motor === record.motor && this.clock.now() < deadline) {
            await this.clock.sleep(this.pollIntervalMs);
            poll = await this.client.motorPoll(record.board);
          }
        } catch {
          poll = null;
        }
        const outcome: DispenseOutcome =
          poll && poll.state === 'finished' && poll.motor === record.motor
            ? outcomeOfRun(poll, record.motor, curtainMode, this.options.policy)
            : { status: 'unknown', reason: `the agent restarted ${record.phase === 'run_pending' ? 'while sending the motor run' : 'during the run'} and the board no longer has its result` };
        settled.push({ commandId: record.commandId, outcome: await this.finish(record.commandId, poll, outcome) });
      }
    }
    return settled;
  }

  /** Clears the board for a new run: waits out a run in progress and reads (so clears) any result left over, attributing it through the journal. */
  private async prepareBoard(board: number): Promise<'ready' | string> {
    let poll: MotorPoll;
    try {
      poll = await this.client.motorPoll(board);
      const deadline = this.clock.now() + 12_000;
      while (poll.state === 'running' && this.clock.now() < deadline) {
        await this.clock.sleep(this.pollIntervalMs);
        poll = await this.client.motorPoll(board);
      }
    } catch (error) {
      return error instanceof BoardUnreachableError ? 'not answering' : String(error);
    }
    if (poll.state === 'running') return 'a motor is still running';
    if (poll.state === 'finished') {
      // A leftover result: settle the command it belongs to, if the journal knows one waiting on it.
      const owner = this.journal.all().find((record) => (record.phase === 'run_pending' || record.phase === 'run_started') && record.board === board && record.motor === poll.motor);
      if (owner) {
        const curtainMode = this.slots.get(owner.slotId ?? '')?.run.curtainMode ?? 2;
        await this.finish(owner.commandId, poll, outcomeOfRun(poll, poll.motor, curtainMode, this.options.policy));
      }
    }
    return 'ready';
  }

  private async awaitResult(commandId: string, lane: Lane): Promise<DispenseOutcome> {
    const deadline = this.clock.now() + lane.completionDeadlineMs;
    let lastPoll: MotorPoll | null = null;
    while (this.clock.now() < deadline) {
      await this.clock.sleep(this.pollIntervalMs);
      try {
        lastPoll = await this.client.motorPoll(lane.board);
      } catch {
        continue; // reads are already retried; keep trying until the deadline
      }
      if (lastPoll.state === 'finished') return this.finish(commandId, lastPoll, outcomeOfRun(lastPoll, lane.run.motor, lane.run.curtainMode, this.options.policy));
      if (lastPoll.state === 'idle') {
        return this.finish(commandId, lastPoll, { status: 'unknown', reason: 'the board cleared the result before the agent could read it' });
      }
    }
    return this.finish(commandId, lastPoll, { status: 'unknown', reason: `no finished result within ${lane.completionDeadlineMs} ms` });
  }

  /** The one real hole (M109E audit §5.4): the motor-run reply was lost. Ask the board; never send the run again unless it's proven it didn't start. */
  private async afterLostRunReply(commandId: string, lane: Lane): Promise<DispenseOutcome | 'not_started'> {
    let poll: MotorPoll;
    try {
      poll = await this.client.motorPoll(lane.board);
    } catch {
      return this.finish(commandId, null, { status: 'unknown', reason: 'the motor-run reply was lost and the board stopped answering' });
    }
    if ((poll.state === 'running' || poll.state === 'finished') && poll.motor === lane.run.motor) {
      await this.journal.record({ t: 'run_started', commandId, at: this.clock.now() });
      return poll.state === 'finished' ? this.finish(commandId, poll, outcomeOfRun(poll, lane.run.motor, lane.run.curtainMode, this.options.policy)) : this.awaitResult(commandId, lane);
    }
    if (poll.state === 'idle' && this.options.resultsPersistUntilRead) {
      await this.journal.record({ t: 'run_refused', commandId, reason: 'reply lost; board idle with no result, and results persist until read — the run never started', at: this.clock.now() });
      return 'not_started';
    }
    return this.finish(commandId, poll, { status: 'unknown', reason: `the motor-run reply was lost and the board shows ${poll.state ?? `state ${poll.rawState}`}${poll.state === 'idle' ? '; whether it ran can’t be told until the result-clearing rule is confirmed (Q1, S7)' : ` for motor ${poll.motor}`}` });
  }

  private async finish(commandId: string, poll: MotorPoll | null, outcome: DispenseOutcome): Promise<DispenseOutcome> {
    await this.journal.record({ t: 'result', commandId, board: poll ? { ...poll } : null, outcome, at: this.clock.now() });
    return outcome;
  }
}
