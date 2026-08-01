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

/**
 * What kind of event this is within its provider — `provider: 'daraja'`
 * alone doesn't distinguish an STK C2B callback from a B2C payout
 * result from a refund reversal result, and Payment reconciliation
 * (§ Payment reconciliation) needs exactly that distinction to find
 * "STK callbacks Safaricom sent us that we couldn't match to any
 * payment attempt" without also catching an unrelated B2C/reversal
 * failure that happens to have no `relatedEntityId` either.
 */
export type WebhookEventKind = 'stk_callback' | 'b2c_result' | 'reversal_result' | 'inbound_message' | 'tracking_update';

export interface WebhookEvent {
  businessId: string;
  provider: WebhookProvider;
  eventKind: WebhookEventKind;
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
  /** A staff member's acknowledgment of an event that needed manual follow-up (e.g. an unmatched payment, § Payment reconciliation) — distinct from `status`, which only ever reflects the system's own processing outcome, never a human's. */
  resolvedBy: string | null;
  resolvedAt: Timestamp | null;
  resolutionNote: string | null;
}
