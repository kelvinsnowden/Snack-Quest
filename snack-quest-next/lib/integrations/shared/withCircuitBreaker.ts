import 'server-only';

/**
 * Shared circuit breaker for every Gateway (PLATFORM_ARCHITECTURE_V2.md
 * §13). Trips after N consecutive failures within a window, short-
 * circuits further calls for a cooldown period instead of letting a
 * down provider (e.g. Daraja during a Safaricom outage) queue up
 * timeouts on every request that happens to need it.
 *
 * State is in-process (a `Map`), not Firestore-backed. That is a
 * known, deliberate limitation: on a multi-instance/serverless
 * deployment (Vercel), each instance sees its own failure count rather
 * than a shared one, so the breaker trips later than a fully durable
 * implementation would — the same class of gap the completeness audit
 * flagged for the old in-memory rate limiter. This is the "start
 * correct for a single process, upgrade the store later" version;
 * swap `inMemoryCircuitStore` for a Firestore/Redis-backed
 * `CircuitBreakerStore` before relying on this under real concurrent
 * load, without changing any call site.
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitRecord {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
}

export interface CircuitBreakerStore {
  get(gatewayName: string): CircuitRecord;
  set(gatewayName: string, record: CircuitRecord): void;
}

class InMemoryCircuitStore implements CircuitBreakerStore {
  private records = new Map<string, CircuitRecord>();

  get(gatewayName: string): CircuitRecord {
    return (
      this.records.get(gatewayName) ?? {
        state: 'closed',
        consecutiveFailures: 0,
        openedAt: null,
      }
    );
  }

  set(gatewayName: string, record: CircuitRecord): void {
    this.records.set(gatewayName, record);
  }
}

const inMemoryCircuitStore: CircuitBreakerStore = new InMemoryCircuitStore();

export class GatewayCircuitOpenError extends Error {
  constructor(gatewayName: string) {
    super(
      `${gatewayName} circuit is open — too many consecutive failures, short-circuiting until the cooldown elapses`,
    );
    this.name = 'GatewayCircuitOpenError';
  }
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  store?: CircuitBreakerStore;
}

const DEFAULTS: Required<Omit<CircuitBreakerOptions, 'store'>> = {
  failureThreshold: 5,
  cooldownMs: 30_000,
};

export async function withCircuitBreaker<T>(
  gatewayName: string,
  fn: () => Promise<T>,
  options: CircuitBreakerOptions = {},
): Promise<T> {
  const { failureThreshold, cooldownMs } = { ...DEFAULTS, ...options };
  const store = options.store ?? inMemoryCircuitStore;

  const record = store.get(gatewayName);

  if (record.state === 'open') {
    const cooldownElapsed =
      record.openedAt !== null && Date.now() - record.openedAt >= cooldownMs;
    if (!cooldownElapsed) {
      throw new GatewayCircuitOpenError(gatewayName);
    }
    // Cooldown elapsed — allow exactly one trial call (half-open) before
    // deciding whether to close or re-open.
    store.set(gatewayName, { ...record, state: 'half_open' });
  }

  try {
    const result = await fn();
    store.set(gatewayName, {
      state: 'closed',
      consecutiveFailures: 0,
      openedAt: null,
    });
    return result;
  } catch (error) {
    const consecutiveFailures = record.consecutiveFailures + 1;
    const shouldTrip =
      record.state === 'half_open' || consecutiveFailures >= failureThreshold;
    store.set(gatewayName, {
      state: shouldTrip ? 'open' : 'closed',
      consecutiveFailures,
      openedAt: shouldTrip ? Date.now() : null,
    });
    throw error;
  }
}
