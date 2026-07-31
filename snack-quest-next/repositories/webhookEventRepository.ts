import 'server-only';

import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import type { WebhookProvider } from '@/types';

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
        providerEventId: input.providerEventId,
        payload: input.payload,
        relatedEntityId: input.relatedEntityId ?? null,
        status: 'received',
        receivedAt: FieldValue.serverTimestamp(),
        processedAt: null,
        error: null,
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
}

export const webhookEventRepository = new WebhookEventRepository();
