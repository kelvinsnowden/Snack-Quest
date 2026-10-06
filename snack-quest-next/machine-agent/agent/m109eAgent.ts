import { newEventId, type SnackQuestMachineClient } from '../../sdk/typescript/snackQuestMachine';
import type { M109eProtocolClient } from '../m109e/protocolClient';
import type { DispenseDriver } from '../m109e/dispenseDriver';
import type { DispenseOutcome } from '../m109e/outcomeMapper';
import type { SlotMap } from '../m109e/slotMap';
import type { Journal, OutcomeReport } from '../journal/journal';

export const AGENT_VERSION = 'm109e-agent/0.1.0';

export interface AgentConfig {
  /** This machine's id as registered with Snack Quest (the integration's manufacturerMachineId). */
  manufacturerMachineId: string;
  /**
   * The DI input (1–4) wired to the door switch, if any. **Unknown until
   * Q9** — with null the agent reports no door state and sends no door
   * events rather than guessing.
   */
  doorInput: 1 | 2 | 3 | 4 | null;
  /** Wall-clock time for timestamps and command expiry (the host's clock). */
  wallNow?: () => number;
  /**
   * The least time between heartbeats (default 30 s). The agent cycles
   * every 2 s while orders are coming in, and Snack Quest accepts 12
   * heartbeats a minute per machine: a heartbeat on every cycle gets
   * rate-limited, and the SDK's back-off then stalls the whole loop —
   * command polling included — for half a minute.
   */
  heartbeatIntervalMs?: number;
  /** The least time between unchanged status reports (default 30 s). A change — online/offline, faults, door — is reported at once. */
  statusIntervalMs?: number;
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_STATUS_INTERVAL_MS = 30_000;

export interface CycleResult {
  executed: string[];
  refused: string[];
  nextPollSeconds: number;
}

/**
 * The Machine Agent's main loop for an M109E machine (Model B: the agent
 * on the machine's host talks to Snack Quest's machine API with the
 * reference SDK and drives the board over RS-232).
 *
 * One cycle: connect if needed → heartbeat (and answer any
 * `reportOutcomes` from the journal) → health and status → door events →
 * send owed reports → poll → for each new command: journal it, ack it
 * (and stop unless 200), run it through the dispense driver, journal the
 * report, send it.
 *
 * What it will not do: send an inventory report. The M109E cannot count
 * what is in a lane, so any number the agent sent would be made up
 * (M109E audit §6).
 */
export class M109eMachineAgent {
  machineCode: string | null = null;
  private readonly startedAt: number;
  private lastDoorOpen: boolean | null = null;
  private curtainSelfTestFailed = false;
  private recovered = false;
  /** Sandbox controls — the certification harness's hooks. Never set in production. */
  readonly sandbox = { holdNextCommands: false, deferNextReport: false };
  private lastReportedCommandId: string | null = null;
  private lastHeartbeatAt: number | null = null;
  private lastStatus: { at: number; key: string } | null = null;

  constructor(
    private readonly api: SnackQuestMachineClient,
    private readonly board: M109eProtocolClient,
    private readonly slots: SlotMap,
    private readonly journal: Journal,
    private readonly driver: DispenseDriver,
    private readonly config: AgentConfig,
  ) {
    this.startedAt = this.wallNow();
  }

  private wallNow(): number {
    return (this.config.wallNow ?? Date.now)();
  }

  private isoNow(): string {
    return new Date(this.wallNow()).toISOString();
  }

  /** Settles whatever the journal shows was in flight when the agent last stopped. Runs once, before the first cycle. */
  async recover(): Promise<{ commandId: string; outcome: DispenseOutcome }[]> {
    const settled = await this.driver.recover();
    await this.queueReports();
    this.recovered = true;
    return settled;
  }

  async cycle(): Promise<CycleResult> {
    if (!this.recovered) await this.recover();
    if (!this.machineCode) {
      const id = await this.board.getId(this.slots.boards()[0] ?? 1).catch(() => null);
      const connected = await this.api.connect({ manufacturerMachineId: this.config.manufacturerMachineId, controllerType: 'M109E', controllerVersion: id?.hex, integrationVersion: AGENT_VERSION });
      if (!connected.ok || !connected.data?.machineCode) {
        return { executed: [], refused: [], nextPollSeconds: 30 };
      }
      this.machineCode = connected.data.machineCode;
    }
    const code = this.machineCode;

    const now = this.wallNow();
    if (this.lastHeartbeatAt === null || now - this.lastHeartbeatAt >= (this.config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS)) {
      const heartbeat = await this.api.heartbeat(code, { eventId: newEventId('hb'), occurredAt: this.isoNow(), uptimeSeconds: Math.floor((now - this.startedAt) / 1000) });
      this.lastHeartbeatAt = now;
      for (const wanted of heartbeat.data?.reportOutcomes ?? []) await this.answerOutcomeRequest(wanted.commandId);
    }

    await this.reportHealth();
    await this.flushReports(code);
    return this.pollAndExecute(code);
  }

  /** Reads the boards and reports status: online only if every board answers and the curtain hasn't failed its self-test. */
  async reportHealth(): Promise<void> {
    const code = this.machineCode;
    if (!code) throw new Error('connect first: the agent does not know its machine code yet');
    const faults: string[] = [];
    let temperatureCelsius: number | undefined;
    for (const address of this.slots.boards()) {
      try {
        const celsius = await this.board.readTemperature(address);
        if (temperatureCelsius === undefined && celsius !== null) temperatureCelsius = celsius;
      } catch {
        faults.push(`m109e_board_${address}_unreachable`);
      }
    }
    if (this.curtainSelfTestFailed) faults.push('light_curtain_self_test_failed');

    let doorOpen: boolean | undefined;
    if (this.config.doorInput !== null) {
      try {
        const inputs = await this.board.readInputs(this.slots.boards()[0] ?? 1);
        // Door switch closes the input when the door is shut (to be confirmed, Q9).
        doorOpen = !inputs[this.config.doorInput - 1];
      } catch {
        // unreachable — already a fault above
      }
    }
    // Temperature drifts every reading, so it rides along but doesn't count as a change.
    const key = JSON.stringify({ online: faults.length === 0, doorOpen: doorOpen ?? null, faults });
    const now = this.wallNow();
    const due = this.lastStatus === null || this.lastStatus.key !== key || now - this.lastStatus.at >= (this.config.statusIntervalMs ?? DEFAULT_STATUS_INTERVAL_MS);
    if (due) {
      await this.api.status(code, { eventId: newEventId('st'), occurredAt: this.isoNow(), online: faults.length === 0, doorOpen, temperatureCelsius, faults });
      this.lastStatus = { at: now, key };
    }

    if (doorOpen !== undefined && this.lastDoorOpen !== null && doorOpen !== this.lastDoorOpen) {
      await this.api.events(code, { events: [{ eventId: newEventId('ev'), type: doorOpen ? 'DOOR_OPENED' : 'DOOR_CLOSED', occurredAt: this.isoNow() }] });
    }
    if (doorOpen !== undefined) this.lastDoorOpen = doorOpen;
  }

  private async pollAndExecute(code: string): Promise<CycleResult> {
    const poll = await this.api.pollCommands(code);
    const executed: string[] = [];
    const refused: string[] = [];
    const hold = this.sandbox.holdNextCommands;
    this.sandbox.holdNextCommands = false;

    for (const command of poll.data?.commands ?? []) {
      const known = this.journal.get(command.commandId);
      // Already acted on: executed at most once. (Held or ack-refused commands never reached run_pending, so acking again is safe.)
      if (known && known.phase !== 'received' && known.phase !== 'ack_refused') continue;
      if (!known) {
        await this.journal.record({ t: 'received', commandId: command.commandId, type: command.type, slotId: command.slotId ?? null, expiresAt: command.expiresAt, at: this.wallNow() });
      }
      if (hold) continue;
      if (Date.parse(command.expiresAt) <= this.wallNow() + this.api.clockOffset * 1000) {
        refused.push(command.commandId);
        continue;
      }
      const ack = await this.api.ack(code, command.commandId);
      if (ack.status !== 200) {
        await this.journal.record({ t: 'ack_refused', commandId: command.commandId, status: ack.status, at: this.wallNow() });
        refused.push(command.commandId);
        continue;
      }
      await this.journal.record({ t: 'acked', commandId: command.commandId, at: this.wallNow() });
      if (command.type !== 'dispense') {
        // Acknowledged and declined, never dropped silently (spec §4.4).
        await this.journal.record({ t: 'result', commandId: command.commandId, board: null, outcome: { status: 'failed', failureCode: 'failed', reason: `unsupported command type "${command.type}"` }, at: this.wallNow() });
        refused.push(command.commandId);
      } else {
        const outcome = await this.driver.execute(command.commandId);
        if (outcome.status === 'failed' && outcome.failureCode === 'sensor_failure') this.curtainSelfTestFailed = true;
        executed.push(command.commandId);
      }
      await this.queueReports();
      if (this.sandbox.deferNextReport) {
        this.sandbox.deferNextReport = false; // the link "drops": the report stays owed until the next cycle
      } else {
        await this.flushReports(code);
      }
    }
    return { executed, refused, nextPollSeconds: poll.data?.nextPollSeconds ?? 10 };
  }

  /** Turns every decided outcome that has no report yet into an owed report (the outbox). Its eventId is fixed from here on. */
  private async queueReports(): Promise<void> {
    for (const record of this.journal.all()) {
      if (record.phase !== 'result' || !record.outcome || record.reports.length > 0) continue;
      await this.journal.record({ t: 'report_owed', commandId: record.commandId, report: toReport(record.outcome, this.isoNow()), at: this.wallNow() });
    }
  }

  /** Sends owed reports, oldest first. Accepted — or refused for good (4xx other than 429) — stops the resending. */
  async flushReports(code: string): Promise<void> {
    for (const owed of this.journal.owedReports()) {
      const sent = await this.api.report(code, owed.commandId, owed.report);
      if (sent.ok || (sent.status >= 400 && sent.status < 500 && sent.status !== 429)) {
        await this.journal.record({ t: 'report_accepted', commandId: owed.commandId, eventId: owed.report.eventId, httpStatus: sent.status, at: this.wallNow() });
        this.lastReportedCommandId = owed.commandId;
      }
    }
  }

  /** Snack Quest asked for a command's outcome (heartbeat `reportOutcomes`). Answered from the journal only. */
  private async answerOutcomeRequest(commandId: string): Promise<void> {
    const record = this.journal.get(commandId);
    if (!record) return; // never received here, so never acknowledged by this agent: nothing true to say
    const last = this.journal.lastOutcome(commandId);
    if (last) {
      await this.api.report(this.machineCode!, commandId, last);
      return;
    }
    if (record.phase === 'received' || record.phase === 'ack_refused') {
      // No run_pending on disk, so the motor was never driven for it.
      await this.journal.record({ t: 'result', commandId, board: null, outcome: { status: 'failed', failureCode: 'failed', reason: 'received but never executed by the machine' }, at: this.wallNow() });
      await this.queueReports();
    }
  }

  /** Sandbox: re-sends the last accepted outcome report unchanged (same eventId), as if its response had been lost. */
  async retransmitLastReport(): Promise<{ status: number; result: string | null }> {
    if (!this.machineCode || !this.lastReportedCommandId) return { status: 0, result: 'no report sent yet' };
    const last = this.journal.lastOutcome(this.lastReportedCommandId);
    if (!last) return { status: 0, result: 'no report sent yet' };
    const sent = await this.api.report(this.machineCode, this.lastReportedCommandId, last);
    return { status: sent.status, result: sent.data?.result ?? null };
  }
}

function toReport(outcome: DispenseOutcome, occurredAt: string): OutcomeReport {
  const eventId = newEventId('out');
  if (outcome.status === 'dispensed') return { status: 'dispensed', eventId, occurredAt };
  if (outcome.status === 'failed') return { status: 'failed', eventId, occurredAt, failureCode: outcome.failureCode, failureReason: outcome.reason };
  return { status: 'unknown', eventId, occurredAt, failureReason: outcome.reason };
}
