import { sharedKv, type KvClient } from '@/lib/kv/upstashRestClient';
import { logger } from '@/lib/observability/logger';

/**
 * Fixed-window rate limiting with pluggable storage.
 *
 * - With a shared store (Redis over REST, `lib/kv/upstashRestClient.ts`)
 *   the limits are exact across every serverless instance.
 * - Without one — or if it fails — counts are kept per instance
 *   (`MemoryRateLimitStore`). That still protects the platform (each
 *   instance sheds its own abuse before touching Firestore) but the
 *   effective limit becomes "per instance". Operating at scale without
 *   the shared store is documented as a condition, not hidden.
 *
 * A request can be checked against several rules at once (per machine,
 * per credential, …); each rule's counter is charged, and the request is
 * refused if any rule is over its limit.
 */

export interface RateLimitRule {
  /** Stable name, returned to the caller so they know which budget they exhausted. */
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitCheck {
  /** Counter identity, e.g. `m:SQ-MCH-000001:heartbeat`. Must not contain secrets. */
  key: string;
  rule: RateLimitRule;
  /** Units consumed (default 1) — e.g. the number of events in a batch. */
  cost?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** The rule that decided the outcome: the one exceeded, or the tightest remaining. */
  rule: RateLimitRule;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimitStore {
  readonly name: string;
  /** Adds `cost` to the counter for this window and returns the new total and seconds until the window resets. */
  hit(key: string, cost: number, windowSeconds: number, now: number): Promise<{ count: number; resetSeconds: number }>;
  /** Reads without charging. */
  peek(key: string, windowSeconds: number, now: number): Promise<{ count: number; resetSeconds: number }>;
}

function windowStart(now: number, windowSeconds: number): number {
  return Math.floor(now / 1000 / windowSeconds) * windowSeconds;
}

export class MemoryRateLimitStore implements RateLimitStore {
  readonly name = 'memory';
  private readonly counters = new Map<string, { count: number; expiresAt: number }>();
  private lastSweep = 0;

  constructor(private readonly maxKeys = 50_000) {}

  async hit(key: string, cost: number, windowSeconds: number, now: number) {
    this.sweep(now);
    const start = windowStart(now, windowSeconds);
    const bucket = `${key}@${start}`;
    const expiresAt = (start + windowSeconds) * 1000;
    const existing = this.counters.get(bucket);
    const count = (existing?.count ?? 0) + cost;
    if (!existing && this.counters.size >= this.maxKeys) {
      const oldest = this.counters.keys().next().value;
      if (oldest !== undefined) {
        this.counters.delete(oldest);
      }
    }
    this.counters.set(bucket, { count, expiresAt });
    return { count, resetSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)) };
  }

  async peek(key: string, windowSeconds: number, now: number) {
    const start = windowStart(now, windowSeconds);
    const expiresAt = (start + windowSeconds) * 1000;
    return { count: this.counters.get(`${key}@${start}`)?.count ?? 0, resetSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)) };
  }

  reset(): void {
    this.counters.clear();
  }

  private sweep(now: number) {
    if (now - this.lastSweep < 10_000) {
      return;
    }
    this.lastSweep = now;
    for (const [bucket, value] of this.counters) {
      if (value.expiresAt <= now) {
        this.counters.delete(bucket);
      }
    }
  }
}

export class KvRateLimitStore implements RateLimitStore {
  readonly name = 'shared';

  constructor(private readonly kv: KvClient, private readonly prefix = 'rl') {}

  async hit(key: string, cost: number, windowSeconds: number, now: number) {
    const start = windowStart(now, windowSeconds);
    const bucket = `${this.prefix}:${key}@${start}`;
    const [count] = await this.kv.pipeline([
      ['INCRBY', bucket, cost],
      ['EXPIRE', bucket, windowSeconds + 5],
    ]);
    const resetSeconds = Math.max(1, Math.ceil((start + windowSeconds) - now / 1000));
    return { count: Number(count), resetSeconds };
  }

  async peek(key: string, windowSeconds: number, now: number) {
    const start = windowStart(now, windowSeconds);
    const [count] = await this.kv.pipeline([['GET', `${this.prefix}:${key}@${start}`]]);
    return { count: Number(count ?? 0), resetSeconds: Math.max(1, Math.ceil((start + windowSeconds) - now / 1000)) };
  }
}

/** Shared store with a memory fallback: a Redis outage degrades limits to per-instance, it never takes the API down. */
export class FallbackRateLimitStore implements RateLimitStore {
  readonly name: string;

  constructor(private readonly primary: RateLimitStore, private readonly fallback: RateLimitStore) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  async hit(key: string, cost: number, windowSeconds: number, now: number) {
    try {
      return await this.primary.hit(key, cost, windowSeconds, now);
    } catch (error) {
      logger.warn('rate limit store unavailable, using per-instance counters', { store: this.primary.name, error });
      return this.fallback.hit(key, cost, windowSeconds, now);
    }
  }

  async peek(key: string, windowSeconds: number, now: number) {
    try {
      return await this.primary.peek(key, windowSeconds, now);
    } catch {
      return this.fallback.peek(key, windowSeconds, now);
    }
  }
}

export class RateLimiter {
  constructor(private readonly store: RateLimitStore) {}

  get storeName(): string {
    return this.store.name;
  }

  async check(checks: RateLimitCheck[], now: number = Date.now()): Promise<RateLimitDecision> {
    let tightest: RateLimitDecision | null = null;
    let denied: RateLimitDecision | null = null;
    const results = await Promise.all(
      checks.map(async (check) => ({ check, result: await this.store.hit(check.key, check.cost ?? 1, check.rule.windowSeconds, now) })),
    );
    for (const { check, result } of results) {
      const remaining = Math.max(0, check.rule.limit - result.count);
      const decision: RateLimitDecision = { allowed: result.count <= check.rule.limit, rule: check.rule, remaining, resetSeconds: result.resetSeconds };
      if (!decision.allowed && (!denied || decision.resetSeconds > denied.resetSeconds)) {
        denied = decision;
      }
      if (!tightest || remaining / check.rule.limit < tightest.remaining / tightest.rule.limit) {
        tightest = decision;
      }
    }
    if (denied) {
      return denied;
    }
    return tightest ?? { allowed: true, rule: { name: 'none', limit: Number.MAX_SAFE_INTEGER, windowSeconds: 60 }, remaining: Number.MAX_SAFE_INTEGER, resetSeconds: 60 };
  }

  /** True if the counter is already over the rule, without charging it — for "is this IP blocked?" checks before any work. */
  async isOver(key: string, rule: RateLimitRule, now: number = Date.now()): Promise<boolean> {
    const { count } = await this.store.peek(key, rule.windowSeconds, now);
    return count > rule.limit;
  }

  /** Charges a counter without deciding anything — for recording failures. */
  async record(key: string, rule: RateLimitRule, cost = 1, now: number = Date.now()): Promise<number> {
    const { count } = await this.store.hit(key, cost, rule.windowSeconds, now);
    return count;
  }
}

const memoryStore = new MemoryRateLimitStore();
let defaultLimiter: RateLimiter | null = null;

export function defaultRateLimiter(): RateLimiter {
  if (!defaultLimiter) {
    const kv = sharedKv();
    defaultLimiter = new RateLimiter(kv ? new FallbackRateLimitStore(new KvRateLimitStore(kv), memoryStore) : memoryStore);
  }
  return defaultLimiter;
}

/** Tests only: fresh counters, and optionally a different store. */
export function resetRateLimiterForTesting(store?: RateLimitStore): void {
  memoryStore.reset();
  defaultLimiter = store ? new RateLimiter(store) : null;
}
