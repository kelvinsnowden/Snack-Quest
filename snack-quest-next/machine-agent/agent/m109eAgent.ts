import { newEventId, type SnackQuestMachineClient } from '../../sdk/typescript/snackQuestMachine';
import type { M109eProtocolClient } from '../m109e/protocolClient';
import type { DispenseDriver } from '../m109e/dispenseDriver';
import type { DispenseOutcome } from '../m109e/outcomeMapper';
import type { SlotMap } from '../m109e/slotMap';
import type { CommandOutcome, Journal, OutcomeReport } from '../journal/journal';
import { CoolingTargetError, Thermostat, parseCoolingTarget, type CoolingTarget } from './thermostat';

/** The release number — bumped for every agent change; the bundle and update manifest are named after it. */
export const AGENT_RELEASE = '0.2.0';
export const AGENT_VERSION = `m109e-agent/${AGENT_RELEASE}`;

export interface AgentConfig {
  /** This machine's id as registered with Snack Quest (the integration's manufacturerMachineId). */
  manufacturerMachineId: string;
  /**
   * The DI input (1–4) wired to the door switch, if any. **Unknown until
   * Q9** — with null the agent reports no door state and sends no door
   * events rather than guessing.
   */
  doorInput: 1 | 2 | 3 | 4 | null;
  /**
   * Where the compressor is switched, from the acceptance gate
   * (`capabilityGate(...).agent.cooling`). Null — the default — means the
   * board or a separate controller runs the cooling: the agent only
   * reports the temperature and declines `set_cooling`.
   */
  cooling?: { board: number; compressorOutput: number } | null;
  /** Keeps the last cooling range across restarts (a small file on the host). Without it a restart falls back to the default range. */
  coolingStore?: { load(): CoolingTarget | null; save(target: CoolingTarget): void | Promise<void> };
  /**
   * Installs a new agent release (`update_agent`). Present only in the
   * installed agent (`main.ts`); without it the command is declined.
   */
  updater?: { install(payload: unknown): Promise<{ ok: true; version: string } | { ok: false; reason: string }> };
  /** Wall-clock time for timestamps and command expiry (the host's clock). */
  wallNow?: () => number;
}

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
  /** Set once an update is installed and reported: the process should exit so the service manager starts the new release. */
  restartRequested = false;
  /** The last thing that went wrong, for the health report. */
  lastError: { message: string; at: string } | null = null;
  /** Present only when this agent switches the compressor itself (`config.cooling`). */
  readonly thermostat: Thermostat | null;

  constructor(
    private readonly api: SnackQuestMachineClient,
    private readonly board: M109eProtocolClient,
    private readonly slots: SlotMap,
    private readonly journal: Journal,
    private readonly driver: DispenseDriver,
    private readonly config: AgentConfig,
  ) {
    this.startedAt = this.wallNow();
    this.thermostat = config.cooling ? new Thermostat(config.coolingStore?.load() ?? null) : null;
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

    const heartbeat = await this.api.heartbeat(code, {
      eventId: newEventId('hb'),
      occurredAt: this.isoNow(),
      uptimeSeconds: Math.floor((this.wallNow() - this.startedAt) / 1000),
      diagnostics: { owedReports: this.journal.owedReports().length, lastError: this.lastError?.message ?? null, lastErrorAt: this.lastError?.at ?? null },
    });
    for (const wanted of heartbeat.data?.reportOutcomes ?? []) await this.answerOutcomeRequest(wanted.commandId);

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
    if (this.thermostat && this.config.cooling) {
      const want = this.thermostat.decide(temperatureCelsius ?? null, this.wallNow());
      if (want !== null) {
        const written = await this.board.writeOutput(this.config.cooling.board, this.config.cooling.compressorOutput, want).catch(() => false);
        if (written) this.thermostat.switched(want, this.wallNow());
        else faults.push('cooling_output_unreachable');
      }
    }

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
    await this.api.status(code, { eventId: newEventId('st'), occurredAt: this.isoNow(), online: faults.length === 0, doorOpen, temperatureCelsius, faults });

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
      // A new release is installed: leave the rest for it (they aren't acknowledged, so they come back on its first poll).
      if (this.restartRequested) break;
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
      if (command.type === 'update_agent') {
        const outcome = await this.applyUpdate(command.payload);
        await this.journal.record({ t: 'result', commandId: command.commandId, board: null, outcome, at: this.wallNow() });
        (outcome.status === 'completed' ? executed : refused).push(command.commandId);
      } else if (command.type === 'set_cooling') {
        const outcome = await this.applyCooling(command.payload);
        await this.journal.record({ t: 'result', commandId: command.commandId, board: null, outcome, at: this.wallNow() });
        (outcome.status === 'completed' ? executed : refused).push(command.commandId);
      } else if (command.type !== 'dispense') {
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

  /** A new agent release. Installed beside the running one; the restart happens after the report is sent (`restartRequested`). */
  private async applyUpdate(payload: unknown): Promise<CommandOutcome> {
    if (!this.config.updater) return { status: 'failed', failureCode: 'failed', reason: 'this agent was not installed with the updater' };
    const result = await this.config.updater.install(payload).catch((error: unknown) => ({ ok: false as const, reason: error instanceof Error ? error.message : String(error) }));
    if (!result.ok) return { status: 'failed', failureCode: 'failed', reason: result.reason };
    this.restartRequested = true;
    return { status: 'completed', note: `installed ${result.version}` };
  }

  /** A new cooling range from Snack Quest. Declined, with the reason, when this machine's cooling isn't the agent's to run. */
  private async applyCooling(payload: unknown): Promise<CommandOutcome> {
    if (!this.thermostat) {
      return { status: 'failed', failureCode: 'failed', reason: 'this machine runs its own cooling; the agent does not switch the compressor (acceptance S11, S12)' };
    }
    try {
      const target = parseCoolingTarget(payload);
      this.thermostat.setTarget(target);
      await this.config.coolingStore?.save(target);
      return { status: 'completed', note: target.enabled ? `cooling ${target.minCelsius}–${target.maxCelsius} °C` : 'cooling off' };
    } catch (error) {
      if (error instanceof CoolingTargetError) return { status: 'failed', failureCode: 'failed', reason: error.message };
      throw error;
    }
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

function toReport(outcome: CommandOutcome, occurredAt: string): OutcomeReport {
  const eventId = newEventId('out');
  if (outcome.status === 'completed') return { status: 'completed', eventId, occurredAt };
  if (outcome.status === 'dispensed') return { status: 'dispensed', eventId, occurredAt };
  if (outcome.status === 'failed') return { status: 'failed', eventId, occurredAt, failureCode: outcome.failureCode, failureReason: outcome.reason };
  return { status: 'unknown', eventId, occurredAt, failureReason: outcome.reason };
}
