/**
 * A minimal client for Redis over Upstash's REST API — plain `fetch`, no
 * new dependency. Used for the two pieces of state that must be shared
 * across serverless instances and are too hot for Firestore: rate-limit
 * counters and (optionally) request nonces.
 *
 * Configured by `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
 * (or the `KV_REST_API_URL` + `KV_REST_API_TOKEN` pair Vercel's
 * marketplace integration sets). Absent both, `sharedKv()` is null and
 * callers fall back to what they did without it.
 */

export type RedisCommand = (string | number)[];

export interface KvClient {
  pipeline(commands: RedisCommand[]): Promise<unknown[]>;
}

export class KvUnavailableError extends Error {
  constructor(detail: string) {
    super(`Shared KV unavailable: ${detail}`);
    this.name = 'KvUnavailableError';
  }
}

export class UpstashRestClient implements KvClient {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    private readonly timeoutMs = 1_500,
  ) {}

  async pipeline(commands: RedisCommand[]): Promise<unknown[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(commands),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new KvUnavailableError(`HTTP ${response.status}`);
      }
      const body = (await response.json()) as { result?: unknown; error?: string }[];
      return body.map((entry) => {
        if (entry.error) {
          throw new KvUnavailableError(entry.error);
        }
        return entry.result;
      });
    } catch (error) {
      if (error instanceof KvUnavailableError) {
        throw error;
      }
      throw new KvUnavailableError(error instanceof Error ? error.name : 'request failed');
    } finally {
      clearTimeout(timer);
    }
  }
}

let cached: KvClient | null | undefined;

export function sharedKv(): KvClient | null {
  if (cached !== undefined) {
    return cached;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  cached = url && token ? new UpstashRestClient(url, token) : null;
  return cached;
}

/** Tests only. */
export function setSharedKvForTesting(client: KvClient | null | undefined): void {
  cached = client;
}
