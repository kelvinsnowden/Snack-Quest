import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { WebhookEvent, WebhookEventKind, WebhookProvider } from '@/types';

/**
 * `webhookEvents` reads/writes (PLATFORM_ARCHITECTURE_V2.md §7/§13).
 * Persistence only, same discipline as every other Repository — the
 * decision to short-circuit on a duplicate belongs to the Service
 * calling this, not here.
 */

const COLLECTION = 'webhookEvents';

function docId(businessId: string, provider: WebhookProvider, providerEventId: string): string {
  return `${businessId}:${provider}:${providerEventId}`;
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 6
  );
}

export interface RecordWebhookEventInput {
  businessId: string;
  provider: WebhookProvider;
  eventKind: WebhookEventKind;
  providerEventId: string;
  payload: Record<string, unknown>;
  relatedEntityId?: string | null;
}

class WebhookEventRepository {
  /**
   * Atomically records an inbound webhook exactly once, using
   * Firestore's `create()` (fails if the document already exists) as
   * the atomicity primitive instead of a get-then-set race. Returns
   * `{ isNew: false }` rather than throwing when the event was already
   * recorded — a duplicate delivery is expected, routine behavior for
   * these providers, not an error. The doc ID is businessId-prefixed
   * so two tenants' providers can never collide on the same event ID.
   */
  async recordIfNew(
    input: RecordWebhookEventInput,
  ): Promise<{ isNew: boolean }> {
    const ref = adminFirestore
      .collection(COLLECTION)
      .doc(docId(input.businessId, input.provider, input.providerEventId));
    try {
      await ref.create({
        businessId: input.businessId,
        provider: input.provider,
        eventKind: input.eventKind,
        providerEventId: input.providerEventId,
        payload: input.payload,
        relatedEntityId: input.relatedEntityId ?? null,
        status: 'received',
        receivedAt: FieldValue.serverTimestamp(),
        processedAt: null,
        error: null,
        resolvedBy: null,
        resolvedAt: null,
        resolutionNote: null,
      });
      return { isNew: true };
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        return { isNew: false };
      }
      throw error;
    }
  }

  async markProcessed(
    businessId: string,
    provider: WebhookProvider,
    providerEventId: string,
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(docId(businessId, provider, providerEventId))
      .update({
        status: 'processed',
        processedAt: FieldValue.serverTimestamp(),
      });
  }

  async markFailed(
    businessId: string,
    provider: WebhookProvider,
    providerEventId: string,
    error: string,
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(docId(businessId, provider, providerEventId))
      .update({
        status: 'failed',
        processedAt: FieldValue.serverTimestamp(),
        error,
      });
  }

  /**
   * Payment reconciliation (§ Payment reconciliation) — real M-Pesa STK
   * callbacks Safaricom sent us that `PaymentService.processCallback`
   * could not match to any known payment attempt or intent
   * (`ProcessCallbackResult.status === 'unmatched'`, always recorded
   * here as `eventKind: 'stk_callback'` + `status: 'failed'`).
   * Deliberately scoped to `stk_callback` only, not every `daraja`
   * failure — a failed B2C payout or refund reversal already has a
   * known withdrawal/refund it belongs to; this is specifically for
   * money that arrived with no idea what it was for.
   */
  async listUnmatchedPayments(
    businessId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ events: { id: string; data: WebhookEvent }[]; nextCursor: string | null }> {
    const pageSize = options.limit ?? 25;
    let query = adminFirestore
      .collection(COLLECTION)
      .where('businessId', '==', businessId)
      .where('eventKind', '==', 'stk_callback' satisfies WebhookEventKind)
      .where('status', '==', 'failed')
      .orderBy('receivedAt', 'desc')
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
      events: docs.map((doc) => ({ id: doc.id, data: doc.data() as WebhookEvent })),
      nextCursor: hasMore ? docs[docs.length - 1].id : null,
    };
  }

  /** A staff member's acknowledgment that they've investigated an unmatched payment outside this system (e.g. against M-Pesa's own statements) — see `WebhookEvent.resolvedBy`'s own comment for why this is distinct from `status`. */
  async markResolved(
    businessId: string,
    provider: WebhookProvider,
    providerEventId: string,
    actor: string,
    note: string,
  ): Promise<void> {
    await adminFirestore
      .collection(COLLECTION)
      .doc(docId(businessId, provider, providerEventId))
      .update({
        resolvedBy: actor,
        resolvedAt: FieldValue.serverTimestamp(),
        resolutionNote: note,
      });
  }
}

export const webhookEventRepository = new WebhookEventRepository();
