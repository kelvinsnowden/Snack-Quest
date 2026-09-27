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
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  /** Backoff between retries of safe requests, in ms. */
  retryDelaysMs?: number[];
}

/** Connection-level failures that prove the request never reached the server. Anything else after sending is ambiguous. */
const NOT_DELIVERED_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH']);

function errorCode(error: unknown): string | null {
  const cause = (error as { cause?: { code?: unknown } })?.cause;
  if (cause && typeof cause.code === 'string') {
    return cause.code;
  }
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? code : null;
}

/**
 * Outbound transport for adapters that call a manufacturer's HTTP API
 * (§ MODEL A — SNACK QUEST CONSUMES MANUFACTURER API). What every such
 * adapter needs and none should reimplement:
 *
 * - a hard timeout on every request (AbortController);
 * - failures classified the way the dispense ledger needs them:
 *   `HardwareUnreachableError` only when the request provably never
 *   left (connection refused, DNS), `HardwareTimeoutError` when it may
 *   have been received, `HardwareAuthenticationError` on 401/403;
 * - retries only where they are safe: idempotent reads, and writes
 *   that carry an idempotency key *and* provably never arrived. A
 *   timed-out write is never retried here — the product may already be
 *   in the tray.
 */
export class ManufacturerHttpClient {
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly retryDelaysMs: number[];

  constructor(private readonly config: ManufacturerHttpClientConfig) {
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
    this.retryDelaysMs = config.retryDelaysMs ?? [250, 1000];
  }

  async request(
    method: 'GET' | 'PUT' | 'POST',
    path: string,
    options: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<{ status: number; json: unknown }> {
    const safeToRetry = method === 'GET' || Boolean(options.idempotencyKey);
    const attempts = safeToRetry ? this.retryDelaysMs.length + 1 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.retryDelaysMs[attempt - 1]));
      }
      try {
        const result = await this.once(method, path, options);
        // A 5xx on a read is worth another try; on a write it is ambiguous and returned as-is.
        if (method === 'GET' && result.status >= 500 && attempt < attempts - 1) {
          lastError = new HardwareUnreachableError(this.config.adapterKey, `HTTP ${result.status}`);
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

  private async once(method: string, path: string, options: { body?: unknown; idempotencyKey?: string }): Promise<{ status: number; json: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        signal: controller.signal,
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
        throw new HardwareTimeoutError(this.config.adapterKey, `${method} ${path} exceeded ${this.timeoutMs}ms`);
      }
      const code = errorCode(error);
      if (code && NOT_DELIVERED_CODES.has(code)) {
        throw new HardwareUnreachableError(this.config.adapterKey, `${method} ${path}: ${code}`);
      }
      // A reset or anything unclassified mid-request: it may have arrived.
      throw new HardwareTimeoutError(this.config.adapterKey, `${method} ${path}: ${code ?? (error instanceof Error ? error.message : 'network error')}`);
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403) {
      throw new HardwareAuthenticationError(this.config.adapterKey, `HTTP ${response.status} from ${method} ${path}`);
    }
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return { status: response.status, json };
  }
}
