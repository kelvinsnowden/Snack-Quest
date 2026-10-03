import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { sharedKv, type KvClient } from '@/lib/kv/upstashRestClient';
import { logger } from '@/lib/observability/logger';

/**
 * Fixed-window rate limiting with pluggable storage — shared across
 * every serverless instance in every configuration:
 *
 * - **KV** (Redis over REST, `lib/kv/upstashRestClient.ts`) when
 *   configured: exact, cheapest at volume.
 * - **Firestore** otherwise, and whenever KV fails: exact for ordinary
 *   keys (atomic increments), and sharded for high-volume keys so no
 *   single counter document takes a fleet's traffic.
 *
 * There is no per-process fallback outside tests: a limit that
 * multiplies by instance count isn't a limit. The in-memory store exists
 * only for unit tests that opt into it explicitly.
 *
 * A request can be checked against several rules at once (per machine,
 * per credential, per manufacturer…); each rule's counter is charged,
 * and the request is refused if any rule is over its limit.
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
  hit(key: string, cost: number, windowSeconds: number, now: number, limitHint?: number): Promise<{ count: number; resetSeconds: number }>;
  /** Reads without charging. */
  peek(key: string, windowSeconds: number, now: number, limitHint?: number): Promise<{ count: number; resetSeconds: number }>;
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

/**
 * Firestore-backed counters — the always-available shared store.
 *
 * `hit` increments atomically and reads back — increments commute, so
 * concurrent requests never contend — and the count a request sees
 * always includes its own charge, so **no more than the limit is ever
 * let through**. For ordinary keys a request that can't fit is refused
 * on a single read without writing, and one that loses a race for the
 * last places is refused and its charge returned, so a burst can't use
 * up the window for later requests.
 *
 * A rule whose limit exceeds `shardAbove` per window is sharded: each
 * request charges one random shard and the total is estimated as
 * shard × shards. That keeps every counter document well under
 * Firestore's sustained per-document write rate at fleet scale, and is
 * accurate exactly where it matters — near a high limit, where traffic
 * is large and evenly spread.
 *
 * Counter documents carry `expiresAt`, deleted by the TTL policy in
 * `firestore.indexes.json`.
 */
export class FirestoreRateLimitStore implements RateLimitStore {
  readonly name = 'firestore';

  constructor(private readonly prefix = 'rl', private readonly shardAbove = 600, private readonly maxShards = 32) {}

  private shardsFor(limitHint: number | undefined): number {
    if (!limitHint || limitHint <= this.shardAbove) return 1;
    return Math.min(this.maxShards, Math.ceil(limitHint / this.shardAbove));
  }

  private ref(key: string, start: number, shard: number) {
    const id = createHash('sha256').update(`${this.prefix}\u0000${key}\u0000${start}\u0000${shard}`).digest('hex').slice(0, 40);
    return adminFirestore.collection('rateLimitCounters').doc(id);
  }

  async hit(key: string, cost: number, windowSeconds: number, now: number, limitHint?: number) {
    const start = windowStart(now, windowSeconds);
    const resetSeconds = Math.max(1, Math.ceil(start + windowSeconds - now / 1000));
    const expiresAt = Timestamp.fromMillis((start + windowSeconds + 60) * 1000);
    const shards = this.shardsFor(limitHint);
    const shard = shards === 1 ? 0 : Math.floor(Math.random() * shards);
    const ref = this.ref(key, start, shard);
    const exact = shards === 1 && limitHint !== undefined;
    if (exact) {
      // Already full: refuse on one read, without writing. A flood past
      // the limit costs a read per request, and can't contend.
      const current = Number((await ref.get()).get('count') ?? 0);
      if (current + cost > limitHint) {
        return { count: current + cost, resetSeconds };
      }
    }
    await ref.set({ count: FieldValue.increment(cost), expiresAt }, { merge: true });
    const count = Number((await ref.get()).get('count') ?? cost);
    if (exact && count > limitHint) {
      // Lost a race for the last places: refused, and the charge is
      // returned so a burst can't use up the window for later requests.
      await ref.set({ count: FieldValue.increment(-cost) }, { merge: true });
    }
    return { count: count * shards, resetSeconds };
  }

  async peek(key: string, windowSeconds: number, now: number, limitHint?: number) {
    const start = windowStart(now, windowSeconds);
    const shards = this.shardsFor(limitHint);
    const snapshots = await adminFirestore.getAll(...Array.from({ length: shards }, (_, shard) => this.ref(key, start, shard)));
    const count = snapshots.reduce((sum, snapshot) => sum + Number(snapshot.get('count') ?? 0), 0);
    return { count, resetSeconds: Math.max(1, Math.ceil(start + windowSeconds - now / 1000)) };
  }
}

/** A shared store with a shared fallback: a KV outage degrades to Firestore counters — still global, never per-instance. */
export class FallbackRateLimitStore implements RateLimitStore {
  readonly name: string;

  constructor(private readonly primary: RateLimitStore, private readonly fallback: RateLimitStore) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  async hit(key: string, cost: number, windowSeconds: number, now: number, limitHint?: number) {
    try {
      return await this.primary.hit(key, cost, windowSeconds, now, limitHint);
    } catch (error) {
      logger.warn('rate limit store unavailable, using the fallback store', { store: this.primary.name, fallback: this.fallback.name, error });
      return this.fallback.hit(key, cost, windowSeconds, now, limitHint);
    }
  }

  async peek(key: string, windowSeconds: number, now: number, limitHint?: number) {
    try {
      return await this.primary.peek(key, windowSeconds, now, limitHint);
    } catch {
      return this.fallback.peek(key, windowSeconds, now, limitHint);
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
      checks.map(async (check) => ({ check, result: await this.store.hit(check.key, check.cost ?? 1, check.rule.windowSeconds, now, check.rule.limit) })),
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
    const { count } = await this.store.peek(key, rule.windowSeconds, now, rule.limit);
    return count > rule.limit;
  }

  /** Charges a counter without deciding anything — for recording failures. */
  async record(key: string, rule: RateLimitRule, cost = 1, now: number = Date.now()): Promise<number> {
    // No limit hint: a failure is always counted, even past the limit, so `isOver` can see it.
    const { count } = await this.store.hit(key, cost, rule.windowSeconds, now);
    return count;
  }
}

let defaultLimiter: RateLimiter | null = null;
let testNamespace = 'rl';

export function defaultRateLimiter(): RateLimiter {
  if (!defaultLimiter) {
    const firestore = new FirestoreRateLimitStore(testNamespace);
    const kv = sharedKv();
    defaultLimiter = new RateLimiter(kv ? new FallbackRateLimitStore(new KvRateLimitStore(kv, testNamespace), firestore) : firestore);
  }
  return defaultLimiter;
}

/** Tests only: fresh counters (a new key namespace — nothing is shared with earlier tests), and optionally a different store. */
export function resetRateLimiterForTesting(store?: RateLimitStore): void {
  testNamespace = `rl-${Math.random().toString(36).slice(2, 10)}`;
  defaultLimiter = store ? new RateLimiter(store) : null;
}
