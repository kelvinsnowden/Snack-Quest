/**
 * Snack Quest Machine API v1 — reference client for TypeScript / Node 18+.
 *
 * Copy this one file into your integration. It has no dependencies
 * beyond `node:crypto` and `fetch`, and it deliberately imports nothing
 * from the Snack Quest codebase: it is what a manufacturer would write
 * from docs/SNACK_QUEST_MACHINE_API_V1.md alone, and the tests prove it
 * against both the official signing test vectors and the real server.
 *
 * What it does for you — and what your code must still do:
 *
 * - Signs every request (HMAC-SHA256 over method, path, timestamp,
 *   nonce and the SHA-256 of the exact body bytes).
 * - Retries transient failures (network, 5xx, 429 with Retry-After)
 *   with the SAME body bytes — so the same `eventId` — and a fresh
 *   nonce and signature. Retrying a report is always safe; Snack Quest
 *   deduplicates by `eventId`.
 * - Corrects its clock offset once when the server says the timestamp
 *   is stale, then retries.
 * - Never retries a 4xx other than 429: those mean "your request is
 *   wrong", and repeating it will not help.
 *
 * Your code must: acknowledge a dispense command and get a 200 BEFORE
 * turning the motor; never dispense a command whose ack was refused;
 * report the outcome with a stable `eventId` and keep re-sending it
 * until Snack Quest answers 2xx (persist it across reboots); report
 * `unknown` — never `failed` — when you cannot tell whether the product
 * dropped.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';

// ─── signing ─────────────────────────────────────────────────────────

export interface SignInput {
  keyId: string;
  secret: string;
  method: string;
  /** Path plus query string exactly as sent, e.g. `/api/v1/machines/SQ-1/commands`. */
  pathWithQuery: string;
  /** The exact bytes you send. A string is encoded as UTF-8. */
  body: string | Uint8Array;
  /** Unix seconds. */
  timestamp: number;
  /** 16–64 characters of [A-Za-z0-9_-], never reused. */
  nonce: string;
}

export function canonicalString(input: Omit<SignInput, 'keyId' | 'secret'>): string {
  const bodyHash = createHash('sha256').update(typeof input.body === 'string' ? Buffer.from(input.body, 'utf8') : input.body).digest('hex');
  return ['v1', String(input.timestamp), input.nonce, input.method.toUpperCase(), input.pathWithQuery, bodyHash].join('\n');
}

export function signatureHeader(secret: string, canonical: string): string {
  return `v1=${createHmac('sha256', secret).update(canonical, 'utf8').digest('hex')}`;
}

export function signedHeaders(input: SignInput): Record<string, string> {
  return {
    'X-SQ-Key-Id': input.keyId,
    'X-SQ-Timestamp': String(input.timestamp),
    'X-SQ-Nonce': input.nonce,
    'X-SQ-Signature': signatureHeader(input.secret, canonicalString(input)),
  };
}

export function newNonce(): string {
  return randomBytes(18).toString('base64url');
}

/** A unique, retry-stable id for one occurrence. Generate it once, store it with the report, reuse it on every retry. */
export function newEventId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`;
}

// ─── client ──────────────────────────────────────────────────────────

/** The subset of `fetch` this client uses — pass your own for tests or custom networking. */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface ClientOptions {
  baseUrl: string;
  keyId: string;
  secret: string;
  fetch?: FetchLike;
  /** Attempts per request including the first (default 4). */
  maxAttempts?: number;
  /** Upper bound on any single backoff wait, ms (default 30 s). */
  maxBackoffMs?: number;
  /** Injectable for tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Called for every attempt — the request log a sandbox or support engineer reads. */
  onAttempt?: (entry: AttemptLog) => void;
}

export interface AttemptLog {
  method: string;
  path: string;
  attempt: number;
  status: number | null;
  errorCode: string | null;
  requestId: string | null;
  nonce: string;
  timestamp: number;
  body: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResult<T> {
  /** HTTP status; 0 if the network failed on every attempt. */
  status: number;
  ok: boolean;
  data: T | null;
  error: ApiError | null;
  /** Quote this to Snack Quest support. */
  requestId: string | null;
  attempts: number;
}

export interface DispenseCommand {
  commandId: string;
  type: 'dispense' | string;
  slotId?: string;
  quantity?: number;
  expiresAt: string;
  [field: string]: unknown;
}

export type DispenseReport =
  | { status: 'dispensing'; eventId: string; occurredAt?: string }
  | { status: 'dispensed'; eventId: string; occurredAt?: string }
  | { status: 'failed'; eventId: string; occurredAt?: string; failureCode?: string; failureReason?: string }
  | { status: 'unknown'; eventId: string; occurredAt?: string; failureReason?: string }
  | { status: 'completed'; eventId: string; occurredAt?: string };

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class SnackQuestMachineClient {
  private clockOffsetSeconds = 0;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: ClientOptions) {
    this.fetchImpl = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Seconds this client adds to its own clock — non-zero after the server corrected it. */
  get clockOffset(): number {
    return this.clockOffsetSeconds;
  }

  connect(body: { manufacturerMachineId: string; serialNumber?: string; firmwareVersion?: string; controllerType?: string; controllerVersion?: string; integrationVersion?: string }) {
    return this.request<{ machineCode: string; [field: string]: unknown }>('POST', '/api/v1/machines/connect', body);
  }

  describe(machineCode: string) {
    return this.request<Record<string, unknown>>('GET', this.machinePath(machineCode, ''));
  }

  heartbeat(machineCode: string, body: { eventId: string; occurredAt?: string; uptimeSeconds?: number }) {
    return this.request<{ accepted: boolean; reportOutcomes?: { commandId: string; reason: string }[] }>('POST', this.machinePath(machineCode, 'heartbeat'), body);
  }

  status(machineCode: string, body: { eventId: string; occurredAt?: string; online: boolean; doorOpen?: boolean; temperatureCelsius?: number; faults?: string[]; paymentDeviceOk?: boolean }) {
    return this.request<{ accepted: boolean; applied: boolean }>('POST', this.machinePath(machineCode, 'status'), body);
  }

  inventory(machineCode: string, body: { reportId: string; occurredAt?: string; slots: { slotId: string; quantity: number }[] }) {
    return this.request<{ slotsReported: number; mismatches: { slotId: string; expected: number; reported: number }[]; unmappedSlots: string[] }>('POST', this.machinePath(machineCode, 'inventory'), body);
  }

  events(machineCode: string, body: { events: { eventId: string; type: string; occurredAt?: string; slotId?: string; data?: Record<string, unknown> }[] }) {
    return this.request<{ recorded: number; duplicates: number; conflictingEventIds: string[]; unknownTypes: string[] }>('POST', this.machinePath(machineCode, 'events'), body);
  }

  pollCommands(machineCode: string) {
    return this.request<{ commands: DispenseCommand[]; nextPollSeconds?: number; serverTime?: string }>('GET', this.machinePath(machineCode, 'commands'));
  }

  /** Must return 200 before you act on a command. A 409 means "do not execute" — the command expired or was cancelled. */
  ack(machineCode: string, commandId: string) {
    return this.request<{ commandId: string; status: string }>('POST', this.machinePath(machineCode, `commands/${encodeURIComponent(commandId)}/ack`), undefined);
  }

  report(machineCode: string, commandId: string, body: DispenseReport) {
    return this.request<{ commandId: string; applied: boolean; result: string }>('POST', this.machinePath(machineCode, `commands/${encodeURIComponent(commandId)}/status`), body);
  }

  private machinePath(machineCode: string, relative: string): string {
    return `/api/v1/machines/${encodeURIComponent(machineCode)}${relative ? `/${relative}` : ''}`;
  }

  /** Low-level: one logical request, signed and retried. The body is serialized once, so every retry sends identical bytes. */
  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResult<T>> {
    const raw = method === 'GET' || body === undefined ? '' : JSON.stringify(body);
    const maxAttempts = this.options.maxAttempts ?? 4;
    let correctedClock = false;
    let last: ApiResult<T> = { status: 0, ok: false, data: null, error: { code: 'network_error', message: 'no attempt made' }, requestId: null, attempts: 0 };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const timestamp = Math.floor(this.now() / 1000) + this.clockOffsetSeconds;
      const nonce = newNonce();
      const headers = {
        ...signedHeaders({ keyId: this.options.keyId, secret: this.options.secret, method, pathWithQuery: path, body: raw, timestamp, nonce }),
        'Content-Type': 'application/json',
        'X-SQ-Client-Request-Id': `${nonce}-${attempt}`,
      };
      let status = 0;
      let retryAfterMs: number | null = null;
      try {
        const response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, '')}${path}`, { method, headers, body: method === 'GET' ? undefined : raw });
        status = response.status;
        const text = await response.text();
        const envelope = parseEnvelope(text);
        last = {
          status,
          ok: status >= 200 && status < 300,
          data: (envelope.data ?? null) as T | null,
          error: envelope.error ?? (status >= 400 ? { code: 'http_error', message: `HTTP ${status}` } : null),
          requestId: envelope.meta?.requestId ?? response.headers.get('SQ-Request-Id'),
          attempts: attempt,
        };
        const retryAfter = response.headers.get('Retry-After');
        retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : null;
      } catch (error) {
        last = { status: 0, ok: false, data: null, error: { code: 'network_error', message: error instanceof Error ? error.message : String(error) }, requestId: null, attempts: attempt };
      }
      this.options.onAttempt?.({ method, path, attempt, status: last.status || null, errorCode: last.error?.code ?? null, requestId: last.requestId, nonce, timestamp, body: raw });

      if (last.ok) {
        return last;
      }
      // The server tells us its time; correct once and retry immediately.
      if (status === 401 && last.error?.code === 'stale_timestamp' && !correctedClock) {
        const serverTimestamp = (last.error.details as { serverTimestamp?: number } | undefined)?.serverTimestamp;
        if (typeof serverTimestamp === 'number') {
          this.clockOffsetSeconds = serverTimestamp - Math.floor(this.now() / 1000);
          correctedClock = true;
          attempt -= 1; // the correction itself doesn't use up an attempt
          continue;
        }
      }
      const retryable = status === 0 || RETRYABLE_STATUSES.has(status);
      if (!retryable || attempt === maxAttempts) {
        return last;
      }
      const backoff = retryAfterMs ?? Math.min(500 * 2 ** (attempt - 1), this.options.maxBackoffMs ?? 30_000);
      await this.sleep(Math.min(backoff, this.options.maxBackoffMs ?? 30_000) + Math.floor(Math.random() * 100));
    }
    return last;
  }
}

function parseEnvelope(text: string): { data?: unknown; error?: ApiError; meta?: { requestId?: string } } {
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as { data?: unknown; error?: ApiError; meta?: { requestId?: string } }) : {};
  } catch {
    return { error: { code: 'invalid_response', message: 'response was not JSON' } };
  }
}

// ─── the machine loop ────────────────────────────────────────────────

export interface MachineHardware {
  /** Physically vend one item from the manufacturer's slot. Resolve with what the sensors saw. */
  dispense(slotId: string): Promise<{ outcome: 'dispensed' } | { outcome: 'failed'; failureCode: string; reason?: string } | { outcome: 'unknown'; reason?: string }>;
}

/** Where outcome reports wait until Snack Quest accepts them. Must survive a reboot on real hardware. */
export interface OutboxStore {
  put(commandId: string, report: DispenseReport): Promise<void>;
  remove(commandId: string): Promise<void>;
  list(): Promise<{ commandId: string; report: DispenseReport }[]>;
}

export class MemoryOutbox implements OutboxStore {
  private readonly items = new Map<string, DispenseReport>();
  async put(commandId: string, report: DispenseReport) {
    this.items.set(commandId, report);
  }
  async remove(commandId: string) {
    this.items.delete(commandId);
  }
  async list() {
    return Array.from(this.items.entries()).map(([commandId, report]) => ({ commandId, report }));
  }
}

/**
 * One cycle of a correct machine: flush unsent outcome reports, poll,
 * and for each dispense command — ack (and stop unless 200), dispense,
 * persist the report, send it. Call it every `nextPollSeconds`.
 */
export async function runPollCycle(client: SnackQuestMachineClient, machineCode: string, hardware: MachineHardware, outbox: OutboxStore): Promise<{ executed: string[]; refused: string[]; nextPollSeconds: number }> {
  for (const pending of await outbox.list()) {
    const sent = await client.report(machineCode, pending.commandId, pending.report);
    if (sent.ok || (sent.status >= 400 && sent.status < 500 && sent.status !== 429)) {
      // Accepted — or rejected for good (e.g. unknown command); either way stop re-sending.
      await outbox.remove(pending.commandId);
    }
  }

  const poll = await client.pollCommands(machineCode);
  const executed: string[] = [];
  const refused: string[] = [];
  for (const command of poll.data?.commands ?? []) {
    if (command.type !== 'dispense') {
      // A command type this machine doesn't implement: acknowledge it and decline it, never drop it silently (spec §4.4).
      if ((await client.ack(machineCode, command.commandId)).status !== 200) {
        refused.push(command.commandId);
        continue;
      }
      const report: DispenseReport = { status: 'failed', eventId: newEventId('out'), failureReason: 'unsupported command', occurredAt: new Date().toISOString() };
      await outbox.put(command.commandId, report);
      if ((await client.report(machineCode, command.commandId, report)).ok) {
        await outbox.remove(command.commandId);
      }
      refused.push(command.commandId);
      continue;
    }
    // Don't start what has already expired by the server's clock (the ack would be refused anyway).
    if (Date.parse(command.expiresAt) <= Date.now() + client.clockOffset * 1000) {
      refused.push(command.commandId);
      continue;
    }
    const ack = await client.ack(machineCode, command.commandId);
    if (ack.status !== 200) {
      refused.push(command.commandId);
      continue;
    }
    const outcome = await hardware.dispense(command.slotId ?? '');
    const report: DispenseReport =
      outcome.outcome === 'dispensed'
        ? { status: 'dispensed', eventId: newEventId('out'), occurredAt: new Date().toISOString() }
        : outcome.outcome === 'failed'
          ? { status: 'failed', eventId: newEventId('out'), failureCode: outcome.failureCode, failureReason: outcome.reason, occurredAt: new Date().toISOString() }
          : { status: 'unknown', eventId: newEventId('out'), failureReason: outcome.reason, occurredAt: new Date().toISOString() };
    await outbox.put(command.commandId, report);
    const sent = await client.report(machineCode, command.commandId, report);
    if (sent.ok) {
      await outbox.remove(command.commandId);
    }
    executed.push(command.commandId);
  }
  return { executed, refused, nextPollSeconds: poll.data?.nextPollSeconds ?? 10 };
}
