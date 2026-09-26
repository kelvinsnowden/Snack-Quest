import 'server-only';

/**
 * One read per distinct question, per request (§ analytics rollups,
 * docs/FLEET_ARCHITECTURE_AUDIT.md finding 2).
 *
 * The admin Analytics page fires fourteen metrics in one
 * `Promise.all`, and nine of them independently asked the orders
 * collection for the same rows. Nine identical queries, nine round
 * trips, nine deserialisations of one answer.
 *
 * React's `cache()` is the obvious tool and is what `getStaffSession`
 * uses, but it is deliberately not used here: outside a React request
 * scope it is a pass-through that silently dedupes nothing, which
 * makes it both useless in a route handler and impossible to write an
 * honest test for. A fix that cannot be verified is not a fix. This is
 * an explicit scope instead — created per request, passed to the
 * metrics that should share it, and directly assertable.
 *
 * Promises are memoised rather than values, so concurrent callers
 * share the single in-flight read instead of racing to start their
 * own. A rejected read is evicted, so one failure does not poison the
 * rest of the request.
 */
export class AnalyticsRequestCache {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /** Reads issued through this scope, for tests and instrumentation. */
  readonly keys: string[] = [];

  memo<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    this.keys.push(key);
    const promise = load().catch((error: unknown) => {
      this.inFlight.delete(key);
      throw error;
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  /** How many distinct reads this request actually issued. */
  get readCount(): number {
    return this.keys.length;
  }
}

/**
 * A scope that never shares anything, for the singleton service's
 * uncached path. Callers that want one read get one read; callers that
 * want fourteen metrics off one read opt in by creating a real scope.
 */
export class NoRequestCache extends AnalyticsRequestCache {
  override memo<T>(_key: string, load: () => Promise<T>): Promise<T> {
    return load();
  }
}
