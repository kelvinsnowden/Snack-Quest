import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { OutboundMessage } from '@/types';

/**
 * `outboundMessages` reads/writes (§ Notification breadth,
 * PLATFORM_ARCHITECTURE_V2.md §10) — the real per-channel dispatch
 * log `NotificationService` writes to on every send attempt, and the
 * retry sweep (`NotificationService.retrySweep()`) reads from to find
 * real, actionable failures.
 */

const COLLECTION = 'outboundMessages';

export type OutboundMessageInput = Omit<OutboundMessage, 'createdAt'>;

function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 6
  );
}

class OutboundMessageRepository {
  /**
   * `id` is caller-supplied and deterministic (`NotificationService`
   * derives it from `${channel}:${dedupeKey}`), and `.create()` fails
   * atomically if it already exists — the same idempotency-via-
   * document-identity trick `webhookEventRepository.recordIfNew` uses
   * for inbound events, applied here to outbound sends: re-entering
   * `send()` for the same logical notification finds the existing
   * record instead of dispatching a second real email/SMS.
   */
  async create(id: string, input: OutboundMessageInput): Promise<{ created: boolean }> {
    try {
      await adminFirestore
        .collection(COLLECTION)
        .doc(id)
        .create({ ...input, createdAt: FieldValue.serverTimestamp() });
      return { created: true };
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        return { created: false };
      }
      throw error;
    }
  }

  async findById(id: string): Promise<OutboundMessage | null> {
    const snapshot = await adminFirestore.collection(COLLECTION).doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    return snapshot.data() as OutboundMessage;
  }

  async markSent(id: string, providerMessageId: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({
      status: 'sent',
      providerMessageId,
      sentAt: FieldValue.serverTimestamp(),
      failureReason: null,
    });
  }

  async markFailed(id: string, failureReason: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({
      status: 'failed',
      failureReason,
    });
  }

  /** The sweep bumps this before re-attempting, so a message that keeps failing eventually crosses the retry ceiling instead of retrying forever. */
  async incrementRetryCount(id: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({ retryCount: FieldValue.increment(1) });
  }

  /** § NotificationService.retrySweep — real, queryable backlog: failed and still under the retry ceiling, scoped to one business. */
  async listRetryable(
    businessId: string,
    retryCeiling: number,
    limit = 50,
  ): Promise<{ id: string; data: OutboundMessage }[]> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('status', '==', 'failed')
      .where('retryCount', '<', retryCeiling)
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as OutboundMessage }));
  }
}

export const outboundMessageRepository = new OutboundMessageRepository();
