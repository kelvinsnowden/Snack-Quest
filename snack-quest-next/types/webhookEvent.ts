import type { Timestamp } from 'firebase/firestore';

/**
 * `webhookEvents/{provider}:{providerEventId}` — the shared inbound
 * idempotency ledger every provider webhook writes to before doing
 * anything else (PLATFORM_ARCHITECTURE_V2.md §7/§13/§15). Daraja,
 * Whatchimp, and Jumia all deliver at-least-once with documented
 * redelivery on timeout, so every inbound handler must check this
 * ledger first and short-circuit to a no-op success response on a
 * duplicate, never reprocess. Server-only — no client ever reads or
 * writes this collection.
 */
export type WebhookProvider = 'daraja' | 'whatchimp' | 'jumia';

export type WebhookEventStatus = 'received' | 'processed' | 'failed';

export interface WebhookEvent {
  businessId: string;
  provider: WebhookProvider;
  /** The provider's own delivery/message identifier — the actual dedup key. */
  providerEventId: string;
  status: WebhookEventStatus;
  /** Raw payload as received, kept for replay and audit. */
  payload: Record<string, unknown>;
  /** e.g. a paymentIntentId or shipmentId, once the handler resolves what this event is about. */
  relatedEntityId: string | null;
  receivedAt: Timestamp;
  processedAt: Timestamp | null;
  error: string | null;
}
