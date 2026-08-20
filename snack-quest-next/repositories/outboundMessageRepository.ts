import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { OutboundMessage, OutboundMessageStatus } from '@/types';

/** Statuses that count as a real, successful delivery attempt vs. a real failure, for stats purposes — `'queued'` is excluded from both since it means dispatch never actually resolved (normally transient; a message stuck there is its own signal, not a success or a failure). */
const SUCCESS_STATUSES: OutboundMessageStatus[] = ['sent', 'delivered'];
const FAILURE_STATUSES: OutboundMessageStatus[] = ['failed', 'bounced'];

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

  /**
   * § TextSMS delivery reports — the provider confirmed the handset
   * actually received it, which `markSent` alone never establishes
   * (that only means the aggregator accepted the message). This is the
   * one writer of `deliveredAt`, which was `null` for every message
   * until the DLR callback existed.
   */
  async markDelivered(id: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({
      status: 'delivered',
      deliveredAt: FieldValue.serverTimestamp(),
      failureReason: null,
    });
  }

  /**
   * A delivery report saying the message will never arrive (rejected,
   * expired, undeliverable). Distinct from `markFailed` on purpose:
   * `'failed'` means *we* could not hand the message over and a retry
   * may well work, so `listRetryable` picks it up — `'bounced'` means
   * the provider accepted it and the network then refused it, which
   * retrying would only repeat. Nothing re-sends a bounced message.
   */
  async markBounced(id: string, failureReason: string): Promise<void> {
    await adminFirestore.collection(COLLECTION).doc(id).update({
      status: 'bounced',
      failureReason,
    });
  }

  /**
   * § TextSMS delivery reports — resolves a provider's own message id
   * back to the dispatch record, since a DLR callback identifies the
   * message by that id and nothing else. Two equality filters only, so
   * no composite index is needed (same reasoning as `getTemplateStats`
   * below). Scoped by `businessId` so one tenant's callback can never
   * reach another's dispatch log, even on an id collision.
   */
  async findByProviderMessageId(
    businessId: string,
    providerMessageId: string,
  ): Promise<{ id: string; data: OutboundMessage } | null> {
    const snapshot = await adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('providerMessageId', '==', providerMessageId)
      .limit(1)
      .get();

    const doc = snapshot.docs[0];
    return doc ? { id: doc.id, data: doc.data() as OutboundMessage } : null;
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

  /**
   * § Admin: Creators — every real email/SMS ever dispatched to one
   * person, newest first. `recipientRef` is the only per-recipient
   * identifier this collection carries (email or phone, depending on
   * channel — see `types/notification.ts`'s own doc comment), so the
   * caller resolves the real addresses/numbers first (e.g. a creator's
   * `user.email`) and passes them here; `in` lets one query cover more
   * than one contact point (e.g. email today, a phone number once SMS
   * is actually wired up) without a second round trip. Needs the
   * `businessId ASC, recipientRef ASC, createdAt DESC` composite index
   * (see firestore.indexes.json) — an equality filter plus an orderBy
   * on a different field always needs one.
   */
  async listByRecipient(
    businessId: string,
    recipientRefs: string[],
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ messages: { id: string; data: OutboundMessage }[]; nextCursor: string | null }> {
    if (recipientRefs.length === 0) {
      return { messages: [], nextCursor: null };
    }

    const pageSize = options.limit ?? 50;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('recipientRef', 'in', recipientRefs)
      .orderBy('createdAt', 'desc')
      .limit(pageSize + 1) as FirebaseFirestore.Query;

    if (options.cursor) {
      const cursorDoc = await adminFirestore.collection(COLLECTION).doc(options.cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, pageSize);
    const hasMore = snapshot.docs.length > pageSize;

    return {
      messages: docs.map((doc) => ({ id: doc.id, data: doc.data() as OutboundMessage })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }

  /**
   * § Admin: Notification Templates — real sent/failed/pending counts
   * for one template, scoped to a business. Three `.count()`
   * aggregation queries, not a document scan: cheap regardless of how
   * many messages a template has ever sent. Equality-only filters
   * (`businessId ==`, `templateCode ==`, `status in [...]`) never need
   * a composite index — that requirement is specific to combining an
   * equality/`in` filter with a range or `orderBy` on a different
   * field, neither of which happens here.
   */
  async getTemplateStats(
    businessId: string,
    templateCode: string,
  ): Promise<{ sent: number; failed: number; pending: number }> {
    const base = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('templateCode', '==', templateCode);

    const [sentSnap, failedSnap, pendingSnap] = await Promise.all([
      base.where('status', 'in', SUCCESS_STATUSES).count().get(),
      base.where('status', 'in', FAILURE_STATUSES).count().get(),
      base.where('status', '==', 'queued').count().get(),
    ]);

    return {
      sent: sentSnap.data().count,
      failed: failedSnap.data().count,
      pending: pendingSnap.data().count,
    };
  }
}

export const outboundMessageRepository = new OutboundMessageRepository();
