import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';

/**
 * Outbound idempotency for every Gateway call with a side effect
 * (charge a customer, send a message) — PLATFORM_ARCHITECTURE_V2.md
 * §13. This is the outbound analog of `webhookEvents` (§7), which
 * covers *inbound* provider callbacks; this collection is deliberately
 * separate since the two protect different directions of the same
 * problem and have different lifecycles.
 *
 * The calling Service generates a deterministic key (e.g.
 * `daraja-stk:{conversationCheckoutSnapshotId}`) so that re-entering
 * the same logical operation — a genuine caller retry after an
 * ambiguous timeout, not a `withRetry` network-level retry within one
 * call — reuses it rather than minting a fresh one.
 */

const COLLECTION = 'outboundGatewayCalls';

export class GatewayCallInFlightError extends Error {
  constructor(idempotencyKey: string) {
    super(
      `A gateway call with idempotency key "${idempotencyKey}" is already in flight`,
    );
    this.name = 'GatewayCallInFlightError';
  }
}

interface OutboundGatewayCallRecord {
  status: 'in_flight' | 'succeeded' | 'failed';
  result?: unknown;
}

/**
 * Runs `fn` at most once per `idempotencyKey`:
 * - No prior record → reserves the key, runs `fn`, records the outcome.
 * - Prior record `succeeded` → returns the stored result without
 *   re-running `fn` (true idempotent replay).
 * - Prior record `in_flight` → throws `GatewayCallInFlightError` rather
 *   than racing a concurrent execution of the same operation.
 * - Prior record `failed` → treated as a genuine retry; re-runs `fn`
 *   under the same key.
 */
export async function withIdempotency<T>(
  idempotencyKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const ref = adminFirestore.collection(COLLECTION).doc(idempotencyKey);

  const existing = await ref.get();
  if (existing.exists) {
    const record = existing.data() as OutboundGatewayCallRecord;
    if (record.status === 'succeeded') {
      return record.result as T;
    }
    if (record.status === 'in_flight') {
      throw new GatewayCallInFlightError(idempotencyKey);
    }
    // status === 'failed' — fall through and retry under the same key.
  }

  await ref.set({
    status: 'in_flight',
    createdAt: FieldValue.serverTimestamp(),
    completedAt: null,
  });

  try {
    const result = await fn();
    await ref.set(
      {
        status: 'succeeded',
        result: result ?? null,
        completedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return result;
  } catch (error) {
    await ref.set(
      { status: 'failed', completedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    throw error;
  }
}
