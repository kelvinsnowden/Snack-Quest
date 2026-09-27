import { randomUUID } from 'node:crypto';
import { signRequest } from '@/lib/vending/requestSigning';

/**
 * A virtual vending machine that integrates with Snack Quest exactly
 * the way a manufacturer who builds against the Snack Quest Machine API
 * v1 would (docs/SNACK_QUEST_MACHINE_API_V1.md): signed requests, a
 * heartbeat, status and inventory reports, a command poll, and
 * acknowledged, reported dispenses — including every failure mode the
 * platform has to survive (jams, unknown outcomes, going silent,
 * duplicate reports, going offline).
 *
 * It holds no assertions. It does what a machine does and reports what
 * happened; a test or a person decides whether that was right.
 *
 * **Sandbox only.** It refuses a production (`sqk_live_`) key outright,
 * and sandbox integrations are themselves refused on the production
 * deployment — two independent guards against a simulator ever
 * dispensing against real money.
 */

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
  doorOpen = false;
  faults: string[] = [];
  paymentDeviceOk = true;

  constructor(
    private readonly transport: V1Transport,
    private readonly credentials: { keyId: string; secret: string },
    readonly manufacturerMachineId: string,
  ) {
    if (!credentials.keyId.startsWith('sqk_test_')) {
      throw new SandboxOnlyError();
    }
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
    return this.machineCall('POST', 'heartbeat', { eventId: `hb-${randomUUID()}`, occurredAt: new Date().toISOString() });
  }

  async reportStatus() {
    return this.machineCall('POST', 'status', {
      eventId: `st-${randomUUID()}`,
      occurredAt: new Date().toISOString(),
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
    return this.machineCall('POST', 'events', {
      events: events.map((event) => ({ eventId: `ev-${randomUUID()}`, occurredAt: new Date().toISOString(), ...event })),
    });
  }

  /** Re-sends the last report byte-for-byte (new signature, same event id) — the retry-after-lost-ack case. */
  async resendLastReport() {
    if (!this.lastReport) {
      throw new Error('nothing to resend');
    }
    return this.call('POST', this.lastReport.path, this.lastReport.body);
  }

  /** One poll cycle: fetch commands, acknowledge each before acting, execute, report. */
  async pollAndExecute(): Promise<V1CommandExecution[]> {
    const polled = await this.machineCall<{ commands: { commandId: string; type: string; slotId?: string }[] }>('GET', 'commands');
    const executions: V1CommandExecution[] = [];
    for (const command of polled.body?.data?.commands ?? []) {
      const ack = await this.machineCall('POST', `commands/${command.commandId}/ack`);
      if (ack.status !== 200) {
        executions.push({ commandId: command.commandId, type: command.type, acknowledgedStatus: ack.status, reportedStatus: null, outcome: 'not_executed' });
        continue;
      }
      if (command.type === 'dispense') {
        executions.push(await this.executeDispense(command.commandId, command.slotId ?? ''));
      } else {
        const report = await this.report(`commands/${command.commandId}/status`, { status: 'completed', eventId: `c-${randomUUID()}` });
        executions.push({ commandId: command.commandId, type: command.type, acknowledgedStatus: ack.status, reportedStatus: report.status, outcome: 'completed' });
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
    if (behaviour.outcome === 'dispensed' && available > 0) {
      this.stock.set(slotId, available - 1);
      body = { status: 'dispensed', eventId: `out-${randomUUID()}`, occurredAt: new Date().toISOString() };
    } else if (behaviour.outcome === 'dispensed') {
      body = { status: 'failed', failureCode: 'no_product', failureReason: 'slot empty at dispense time', eventId: `out-${randomUUID()}` };
    } else if (behaviour.outcome === 'failed') {
      body = { status: 'failed', failureCode: behaviour.failureCode, failureReason: behaviour.reason ?? behaviour.failureCode, eventId: `out-${randomUUID()}` };
    } else {
      body = { status: 'unknown', failureReason: behaviour.reason ?? 'controller did not confirm', eventId: `out-${randomUUID()}` };
    }
    const report = await this.report(`commands/${commandId}/status`, body);
    return { commandId, type: 'dispense', acknowledgedStatus: 200, reportedStatus: report.status, outcome: String(body.status) };
  }

  private async report(relative: string, body: unknown) {
    const result = await this.machineCall('POST', relative, body);
    this.lastReport = { path: this.machinePath(relative), body };
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
    const raw = body === undefined ? '' : JSON.stringify(body);
    const headers = signRequest({ keyId: this.credentials.keyId, secret: this.credentials.secret, method, pathWithQuery: path, body: raw });
    const response = await this.transport.send(method, path, headers, raw);
    return { status: response.status, body: response.body as ApiEnvelope<T> | null };
  }
}
