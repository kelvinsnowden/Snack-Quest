import 'server-only';

/**
 * Shared retry policy for every Gateway (PLATFORM_ARCHITECTURE_V2.md
 * §13). Exponential backoff with jitter, capped attempts. Only ever
 * wrap idempotent operations with this — a retried call must carry the
 * exact same idempotency key as the original attempt (see
 * `idempotency.ts`), never a freshly generated one, or a retry after a
 * false-negative timeout can double-charge or double-send.
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false for errors that retrying can never fix (e.g. a 400 from bad input). */
  isRetryable?: (error: unknown) => boolean;
}

const DEFAULTS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  isRetryable: () => true,
};

function jitteredDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  return Math.random() * exponential;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs, isRetryable } = {
    ...DEFAULTS,
    ...options,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts;
      if (isLastAttempt || !isRetryable(error)) {
        throw error;
      }
      await sleep(jitteredDelayMs(attempt, baseDelayMs, maxDelayMs));
    }
  }
  // Unreachable — the loop above always either returns or throws.
  throw new Error('withRetry: exhausted attempts without a result');
}
