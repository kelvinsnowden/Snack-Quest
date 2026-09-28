import { randomUUID } from 'node:crypto';
import { SnackQuestMachineClient, newNonce, signedHeaders, type AttemptLog, type FetchLike } from '@/sdk/typescript/snackQuestMachine';

/**
 * A virtual vending machine that integrates with Snack Quest exactly
 * the way a manufacturer who builds against the Snack Quest Machine API
 * v1 would (docs/SNACK_QUEST_MACHINE_API_V1.md) — and it does so
 * through the published TypeScript reference client
 * (sdk/typescript/snackQuestMachine.ts), so every simulator run is also
 * a test of the SDK a manufacturer copies.
 *
 * Signed requests, a heartbeat, status and inventory reports, a command
 * poll, and acknowledged, reported dispenses — plus the sandbox's fault
 * injection (`inject`): slow networks, malformed requests, duplicated
 * and reordered events, missed heartbeats, and every dispense outcome
 * (jams, unknown outcomes, going silent, going offline).
 *
 * It holds no assertions. It does what a machine does and reports what
 * happened; a test, the certification harness or a person decides
 * whether that was right. Every request it makes is in `requestLog`.
 *
 * **Sandbox only.** It refuses a production (`sqk_live_`) key outright,
 * and sandbox integrations are themselves refused on the production
 * deployment — two independent guards against a simulator ever
 * dispensing against real money.
 */

/** Sandbox fault injection — flip these to make the machine misbehave in a specific, reproducible way. */
export interface SandboxFaults {
  /** Added before every request (a slow or congested link). */
  delayMs: number;
  /** The next request is sent as broken JSON (a firmware serialization bug). */
  malformedNextRequest: boolean;
  /** Every events batch is sent twice (an at-least-once transport). */
  duplicateEvents: boolean;
  /** Events in a batch are sent newest-first, and status timestamps run backwards (an offline queue flushed out of order). */
  outOfOrderEvents: boolean;
  /** Heartbeats are silently not sent (a stuck scheduler) while the rest keeps working. */
  heartbeatFailure: boolean;
  /** Every command in a poll response is seen twice (a transport that duplicates messages). */
  duplicateCommandDelivery: boolean;
  /** The next outcome report is delivered, but its response is lost — the machine must re-send it unchanged. */
  loseNextReportResponse: boolean;

  // Integration bugs — for proving the certification harness catches them.
  /** Dispenses without acknowledging first (or regardless of the ack's answer). */
  executeWithoutAck: boolean;
  /** Reports "dispensed" even when the slot is empty (a missing drop sensor). */
  reportDispensedWhenEmpty: boolean;
  /** Re-sends a report under a new event id instead of the original. */
  freshEventIdOnRetry: boolean;
  /** Signs every request with this nonce (a broken random source). */
  fixedNonce: string | null;
}

export interface V1Transport {
  send(method: 'GET' | 'POST', path: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: unknown }>;
}

/** Real HTTP against a running development or staging deployment. */
export class FetchV1Transport implements V1Transport {
  constructor(private readonly baseUrl: string) {}

  async send(method: 'GET' | 'POST', path: string, headers: Record<string, string>, body: string) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { ...headers, 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : body,
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return { status: response.status, body: parsed };
  }
}

export type DispenseBehaviour =
  | { outcome: 'dispensed' }
  | { outcome: 'failed'; failureCode: 'failed' | 'timeout' | 'jam' | 'no_product' | 'sensor_failure' | 'machine_offline'; reason?: string }
  | { outcome: 'unknown'; reason?: string }
  /** Acknowledge, then go silent — the case the timeout sweep exists for. */
  | { outcome: 'no_report' };

export interface V1CommandExecution {
  commandId: string;
  type: string;
  acknowledgedStatus: number;
  reportedStatus: number | null;
  outcome: string;
}

/**
 * What a real machine keeps in non-volatile memory across reboots: which
 * commands it has already executed, and the outcome report it owes for
 * each. Execution is keyed on `commandId` against this record, so a
 * command seen again — duplicated, re-polled, or after a restart — is
 * never executed twice; its stored report is re-sent instead.
 */
export interface MachinePersistentStore {
  executed: Map<string, { report: Record<string, unknown> | null; reported: boolean }>;
}

export const newPersistentStore = (): MachinePersistentStore => ({ executed: new Map() });

export class SandboxOnlyError extends Error {
  constructor() {
    super('The machine simulator only runs with sandbox (sqk_test_) credentials.');
    this.name = 'SandboxOnlyError';
  }
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { code: string; message: string };
}

export class V1SimulatedMachine {
  machineCode: string | null = null;
  private online = true;
  private readonly stock = new Map<string, number>();
  private readonly dispenseQueue: DispenseBehaviour[] = [];
  private lastReport: { path: string; body: unknown } | null = null;
  temperatureCelsius = 5;
  private statusRewind = 0;
  private readonly localQueue: { commandId: string; type: string; slotId?: string }[] = [];
  doorOpen = false;
  faults: string[] = [];
  paymentDeviceOk = true;

  readonly inject: SandboxFaults = {
    delayMs: 0,
    malformedNextRequest: false,
    duplicateEvents: false,
    outOfOrderEvents: false,
    heartbeatFailure: false,
    duplicateCommandDelivery: false,
    loseNextReportResponse: false,
    executeWithoutAck: false,
    reportDispensedWhenEmpty: false,
    freshEventIdOnRetry: false,
    fixedNonce: null,
  };
  /** Every attempt the machine made, in order — nonce, timestamp, status, request id. */
  readonly requestLog: AttemptLog[] = [];
  private readonly client: SnackQuestMachineClient;
  private readonly fetchImpl: FetchLike;
  /** Survives `restart()` — see `MachinePersistentStore`. */
  readonly persistent: MachinePersistentStore;
  /** How many times a command already in the persistent record was seen again and not executed. */
  duplicatesSuppressed = 0;

  constructor(
    transport: V1Transport | { fetch: FetchLike },
    private readonly credentials: { keyId: string; secret: string },
    readonly manufacturerMachineId: string,
    persistent: MachinePersistentStore = newPersistentStore(),
  ) {
    this.persistent = persistent;
    if (!credentials.keyId.startsWith('sqk_test_')) {
      throw new SandboxOnlyError();
    }
    this.fetchImpl = 'fetch' in transport ? transport.fetch : fetchFromTransport(transport as V1Transport);
    this.client = new SnackQuestMachineClient({
      baseUrl: 'http://sandbox.invalid',
      keyId: credentials.keyId,
      secret: credentials.secret,
      fetch: this.fetchImpl,
      maxAttempts: 1,
      onAttempt: (entry) => this.requestLog.push(entry),
    });
  }

  /**
   * A reboot or power cycle: everything in RAM is gone (the local command
   * queue, the last report in flight); what is in flash survives (the
   * executed-command record, the physical stock). Pass
   * `{ loseFlash: true }` to simulate a firmware that keeps nothing —
   * the case the server-side acknowledgement guard exists for.
   */
  restart(options: { loseFlash?: boolean } = {}): void {
    this.localQueue.length = 0;
    this.lastReport = null;
    this.online = true;
    if (options.loseFlash) this.persistent.executed.clear();
  }

  /** Re-sends every stored outcome report the server hasn't confirmed (after a restart, or when a heartbeat asks for them). */
  async resendOwedReports(commandIds?: string[]): Promise<number> {
    let sent = 0;
    for (const [commandId, record] of this.persistent.executed) {
      if (!record.report || (record.reported && !commandIds?.includes(commandId))) continue;
      if (commandIds && !commandIds.includes(commandId)) continue;
      const result = await this.machineCall('POST', `commands/${commandId}/status`, record.report);
      if (result.status === 200) record.reported = true;
      sent += 1;
    }
    return sent;
  }

  goOffline(): void {
    this.online = false;
  }

  comeBackOnline(): void {
    this.online = true;
  }

  /** Physically loads a slot (the manufacturer's own slot name). */
  load(slotId: string, quantity: number): void {
    this.stock.set(slotId, quantity);
  }

  /** Queues how the next dispenses turn out; after the queue drains, dispenses succeed. */
  queueDispenseOutcomes(...behaviours: DispenseBehaviour[]): void {
    this.dispenseQueue.push(...behaviours);
  }

  async connect(firmwareVersion = 'sim-1.0.0') {
    const result = await this.call<{ machineCode: string }>('POST', '/api/v1/machines/connect', { manufacturerMachineId: this.manufacturerMachineId, firmwareVersion });
    if (result.body?.data?.machineCode) {
      this.machineCode = result.body.data.machineCode;
    }
    return result;
  }

  async heartbeat() {
    if (this.inject.heartbeatFailure) {
      return { status: 0, body: null, skipped: true };
    }
    return this.machineCall('POST', 'heartbeat', { eventId: `hb-${randomUUID()}`, occurredAt: new Date().toISOString() });
  }

  async reportStatus() {
    return this.machineCall('POST', 'status', {
      eventId: `st-${randomUUID()}`,
      occurredAt: new Date(Date.now() - (this.inject.outOfOrderEvents ? 60_000 * ++this.statusRewind : 0)).toISOString(),
      online: true,
      doorOpen: this.doorOpen,
      temperatureCelsius: this.temperatureCelsius,
      faults: this.faults,
      paymentDeviceOk: this.paymentDeviceOk,
    });
  }

  async reportInventory() {
    return this.machineCall('POST', 'inventory', {
      reportId: `inv-${randomUUID()}`,
      occurredAt: new Date().toISOString(),
      slots: Array.from(this.stock.entries()).map(([slotId, quantity]) => ({ slotId, quantity })),
    });
  }

  async sendEvents(events: { type: string; slotId?: string; data?: Record<string, unknown> }[]) {
    const now = Date.now();
    let batch = events.map((event, index) => ({ eventId: `ev-${randomUUID()}`, occurredAt: new Date(now + index).toISOString(), ...event }));
    if (this.inject.outOfOrderEvents) {
      batch = [...batch].reverse();
    }
    const first = await this.machineCall('POST', 'events', { events: batch });
    return this.inject.duplicateEvents ? this.machineCall('POST', 'events', { events: batch }) : first;
  }

  /** Re-sends the last report byte-for-byte (new signature, same event id) — the retry-after-lost-ack case. */
  async resendLastReport() {
    if (!this.lastReport) {
      throw new Error('nothing to resend');
    }
    const body = this.inject.freshEventIdOnRetry ? { ...(this.lastReport.body as Record<string, unknown>), eventId: `retry-${randomUUID()}` } : this.lastReport.body;
    return this.call('POST', this.lastReport.path, body);
  }

  /** Fetches commands into the machine's local queue without executing them (a machine that is busy, or batches its work). */
  async pollOnly(): Promise<string[]> {
    const polled = await this.machineCall<{ commands: { commandId: string; type: string; slotId?: string }[] }>('GET', 'commands');
    const commands = polled.body?.data?.commands ?? [];
    for (const command of this.inject.duplicateCommandDelivery ? [...commands, ...commands] : commands) {
      if (this.persistent.executed.has(command.commandId) || this.localQueue.some((queued) => queued.commandId === command.commandId)) {
        this.duplicatesSuppressed += 1;
        continue;
      }
      this.localQueue.push(command);
    }
    return this.localQueue.map((command) => command.commandId);
  }

  /** One poll cycle: fetch commands, then for each — acknowledge before acting, execute, report. */
  async pollAndExecute(): Promise<V1CommandExecution[]> {
    await this.pollOnly();
    const executions: V1CommandExecution[] = [];
    while (this.localQueue.length > 0) {
      const command = this.localQueue.shift()!;
      let ackStatus = 200;
      if (!this.inject.executeWithoutAck) {
        ackStatus = (await this.machineCall('POST', `commands/${command.commandId}/ack`)).status;
        if (ackStatus !== 200) {
          executions.push({ commandId: command.commandId, type: command.type, acknowledgedStatus: ackStatus, reportedStatus: null, outcome: 'not_executed' });
          continue;
        }
      }
      // Recorded before the motor turns: a crash mid-dispense must not lead to a second dispense after reboot.
      this.persistent.executed.set(command.commandId, { report: null, reported: false });
      if (command.type === 'dispense') {
        executions.push(await this.executeDispense(command.commandId, command.slotId ?? ''));
      } else {
        const report = await this.report(`commands/${command.commandId}/status`, { status: 'completed', eventId: `c-${randomUUID()}` });
        executions.push({ commandId: command.commandId, type: command.type, acknowledgedStatus: ackStatus, reportedStatus: report.status, outcome: 'completed' });
      }
    }
    return executions;
  }

  private async executeDispense(commandId: string, slotId: string): Promise<V1CommandExecution> {
    const behaviour = this.dispenseQueue.shift() ?? { outcome: 'dispensed' as const };
    await this.report(`commands/${commandId}/status`, { status: 'dispensing', eventId: `ds-${randomUUID()}` });
    if (behaviour.outcome === 'no_report') {
      return { commandId, type: 'dispense', acknowledgedStatus: 200, reportedStatus: null, outcome: 'no_report' };
    }
    const available = this.stock.get(slotId) ?? 0;
    let body: Record<string, unknown>;
    if (behaviour.outcome === 'dispensed' && (available > 0 || this.inject.reportDispensedWhenEmpty)) {
      this.stock.set(slotId, Math.max(0, available - 1));
      body = { status: 'dispensed', eventId: `out-${randomUUID()}`, occurredAt: new Date().toISOString() };
    } else if (behaviour.outcome === 'dispensed') {
      body = { status: 'failed', failureCode: 'no_product', failureReason: 'slot empty at dispense time', eventId: `out-${randomUUID()}` };
    } else if (behaviour.outcome === 'failed') {
      body = { status: 'failed', failureCode: behaviour.failureCode, failureReason: behaviour.reason ?? behaviour.failureCode, eventId: `out-${randomUUID()}` };
    } else {
      body = { status: 'unknown', failureReason: behaviour.reason ?? 'controller did not confirm', eventId: `out-${randomUUID()}` };
    }
    const record = this.persistent.executed.get(commandId);
    if (record) record.report = body;
    const report = await this.report(`commands/${commandId}/status`, body);
    if (record && report.status === 200) record.reported = true;
    return { commandId, type: 'dispense', acknowledgedStatus: 200, reportedStatus: report.status, outcome: String(body.status) };
  }

  private async report(relative: string, body: unknown) {
    const result = await this.machineCall('POST', relative, body);
    this.lastReport = { path: this.machinePath(relative), body };
    if (this.inject.loseNextReportResponse && relative.endsWith('/status') && (body as { status?: string }).status !== 'dispensing') {
      // Delivered, but the machine never saw the answer.
      this.inject.loseNextReportResponse = false;
      return { status: 0, body: null };
    }
    return result;
  }

  private machinePath(relative: string): string {
    if (!this.machineCode) {
      throw new Error('connect() first — the machine does not know its Snack Quest code yet');
    }
    return `/api/v1/machines/${this.machineCode}${relative ? `/${relative}` : ''}`;
  }

  private machineCall<T = unknown>(method: 'GET' | 'POST', relative: string, body?: unknown) {
    return this.call<T>(method, this.machinePath(relative), body);
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: ApiEnvelope<T> | null; skipped?: boolean }> {
    if (!this.online) {
      return { status: 0, body: null, skipped: true };
    }
    if (this.inject.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.inject.delayMs));
    }
    if (this.inject.malformedNextRequest && method === 'POST') {
      this.inject.malformedNextRequest = false;
      return this.sendRaw<T>(method, path, '{"eventId": "broken');
    }
    if (this.inject.fixedNonce) {
      return this.sendRaw<T>(method, path, body === undefined ? '' : JSON.stringify(body), this.inject.fixedNonce);
    }
    const result = await this.client.request<T>(method, path, body);
    return { status: result.status, body: { data: result.data ?? undefined, error: result.error ?? undefined } };
  }

  /** Signs and sends exact bytes, bypassing the SDK's serializer — for the malformed-request fault. */
  private async sendRaw<T>(method: 'GET' | 'POST', path: string, raw: string, nonce = newNonce()): Promise<{ status: number; body: ApiEnvelope<T> | null }> {
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = { ...signedHeaders({ keyId: this.credentials.keyId, secret: this.credentials.secret, method, pathWithQuery: path, body: raw, timestamp, nonce }), 'Content-Type': 'application/json' };
    const response = await this.fetchImpl(`http://sandbox.invalid${path}`, { method, headers, body: method === 'GET' ? undefined : raw });
    const text = await response.text();
    this.requestLog.push({ method, path, attempt: 1, status: response.status, errorCode: null, requestId: response.headers.get('SQ-Request-Id'), nonce, timestamp, body: raw });
    try {
      return { status: response.status, body: JSON.parse(text) as ApiEnvelope<T> };
    } catch {
      return { status: response.status, body: null };
    }
  }
}

/** Adapts the simulator's older send-style transports to the SDK's fetch shape. */
function fetchFromTransport(transport: V1Transport): FetchLike {
  return async (url, init) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const { status, body } = await transport.send(init.method as 'GET' | 'POST', path, init.headers, init.body ?? '');
    return { status, headers: { get: () => null }, text: async () => (body === null ? '' : JSON.stringify(body)) };
  };
}
