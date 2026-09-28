import { classifyNetworkError, recoveryFor } from '../integrationErrors';
import {
  HardwareAuthenticationError,
  HardwareTimeoutError,
  HardwareUnreachableError,
} from '../hardwareAdapter';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ManufacturerHttpClientConfig {
  adapterKey: string;
  baseUrl: string;
  /** Sent as `Authorization: Bearer <apiKey>` — Snack Quest's own credential for the manufacturer's API. Never logged. */
  apiKey: string;
  /** Deadline for the whole exchange — connect, headers *and* body. */
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  /** Backoff between retries of safe requests, in ms. */
  retryDelaysMs?: number[];
  /** Largest response body accepted; anything bigger is treated as malformed. */
  maxResponseBytes?: number;
}

export interface ManufacturerHttpResponse {
  status: number;
  /** Parsed body; null when empty, not JSON, cut off or too large. */
  json: unknown;
  /** The body was present but unusable: invalid JSON, cut off mid-stream, or over the size limit. */
  malformed: boolean;
}

const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;
/** A `Retry-After` longer than this isn't waited for inside a request; the caller's own recovery takes over. */
const MAX_RETRY_AFTER_MS = 5_000;

/** Connection-level failures that prove the request never reached the server. Anything else after sending is ambiguous. */
function errorCode(error: unknown): string | null {
  const cause = (error as { cause?: { code?: unknown } })?.cause;
  if (cause && typeof cause.code === 'string') {
    return cause.code;
  }
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? code : null;
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/**
 * Outbound transport for adapters that call a manufacturer's HTTP API
 * (§ MODEL A — SNACK QUEST CONSUMES MANUFACTURER API). What every such
 * adapter needs and none should reimplement:
 *
 * - one deadline for the **whole** exchange, body included — a server
 *   that sends headers and then stalls can't hang a dispense;
 * - no redirects followed (a redirect could point anywhere, including
 *   inside our network), and a response size cap;
 * - failures classified the way the dispense ledger needs them:
 *   `HardwareUnreachableError` only when the request provably never
 *   left (connection refused, DNS, TLS), `HardwareTimeoutError` when it
 *   may have been received, `HardwareAuthenticationError` on 401/403;
 *   an unusable body is returned flagged `malformed` for the adapter to
 *   treat as "outcome unknown";
 * - retries only where they are safe: idempotent reads, and writes
 *   that carry an idempotency key when the request provably never
 *   arrived or was answered 408/429 (not processed — and the key makes
 *   a repeat harmless even if it was). `Retry-After` is honoured up to
 *   a few seconds. A timed-out or 5xx write is never retried here — the
 *   product may already be in the tray.
 */
export class ManufacturerHttpClient {
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly retryDelaysMs: number[];
  private readonly maxResponseBytes: number;

  constructor(private readonly config: ManufacturerHttpClientConfig) {
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
    this.retryDelaysMs = config.retryDelaysMs ?? [250, 1000];
    this.maxResponseBytes = config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  }

  async request(
    method: 'GET' | 'PUT' | 'POST',
    path: string,
    options: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<ManufacturerHttpResponse> {
    const safeToRetry = method === 'GET' || Boolean(options.idempotencyKey);
    const attempts = safeToRetry ? this.retryDelaysMs.length + 1 : 1;
    let lastError: unknown;
    let wait = 0;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(wait, this.retryDelaysMs[attempt - 1])));
      }
      wait = 0;
      try {
        const { result, retryAfter } = await this.once(method, path, options);
        const last = attempt === attempts - 1;
        if ((result.status === 408 || result.status === 429) && !last && (retryAfter ?? 0) <= MAX_RETRY_AFTER_MS) {
          // Not processed: the same keyed request again is safe.
          wait = retryAfter ?? 0;
          lastError = null;
          continue;
        }
        // A 5xx on a read is worth another try; on a write it is ambiguous and returned as-is.
        if (method === 'GET' && result.status >= 500 && !last) {
          lastError = new HardwareUnreachableError(this.config.adapterKey, `HTTP ${result.status}`, 'transport.http_5xx');
          continue;
        }
        return result;
      } catch (error) {
        lastError = error;
        // Only a provably undelivered request is retried — never a timeout.
        if (!(error instanceof HardwareUnreachableError)) {
          throw error;
        }
      }
    }
    throw lastError;
  }

  private async once(method: string, path: string, options: { body?: unknown; idempotencyKey?: string }): Promise<{ result: ManufacturerHttpResponse; retryAfter: number | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const timedOut = () => new HardwareTimeoutError(this.config.adapterKey, `${method} ${path} exceeded ${this.timeoutMs}ms`, 'transport.timeout');
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, '')}${path}`, {
          method,
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            accept: 'application/json',
            ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw timedOut();
        }
        const failure = classifyNetworkError(error);
        const detail = `${method} ${path}: ${errorCode(error) ?? (error instanceof Error ? error.message : 'network error')}`;
        if (recoveryFor(failure).delivered === 'no') {
          throw new HardwareUnreachableError(this.config.adapterKey, detail, failure);
        }
        // A reset or anything unclassified mid-request: it may have arrived.
        throw new HardwareTimeoutError(this.config.adapterKey, detail, failure);
      }
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel().catch(() => undefined);
        throw new HardwareAuthenticationError(this.config.adapterKey, `HTTP ${response.status} from ${method} ${path}`, response.status === 403 ? 'auth.forbidden' : 'auth.invalid_credentials');
      }
      const body = await this.readBody(response, controller.signal);
      if (body === 'timeout') {
        throw timedOut();
      }
      let json: unknown = null;
      let malformed = body === null;
      if (body) {
        try {
          json = JSON.parse(body);
        } catch {
          malformed = true;
        }
      }
      return { result: { status: response.status, json, malformed }, retryAfter: retryAfterMs(response) };
    } finally {
      clearTimeout(timer);
    }
  }

  /** The body as text; null when cut off or over the size limit; 'timeout' when the deadline passed mid-body. */
  private async readBody(response: Response, signal: AbortSignal): Promise<string | null | 'timeout'> {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > this.maxResponseBytes) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    if (!response.body) {
      return '';
    }
    const reader = response.body.getReader();
    const aborted = new Promise<'timeout'>((resolve) => {
      if (signal.aborted) resolve('timeout');
      signal.addEventListener('abort', () => resolve('timeout'), { once: true });
    });
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const next = await Promise.race([reader.read(), aborted]);
        if (next === 'timeout') {
          await reader.cancel().catch(() => undefined);
          return 'timeout';
        }
        if (next.done) break;
        total += next.value.byteLength;
        if (total > this.maxResponseBytes) {
          await reader.cancel().catch(() => undefined);
          return null;
        }
        chunks.push(next.value);
      }
    } catch {
      // The connection dropped after the headers: the server answered, but we can't read what it said.
      return signal.aborted ? 'timeout' : null;
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
