import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * `pending` only exists for the instant between the doc being created
 * and the Daraja Transaction Reversal request actually going out — real
 * money hasn't moved either way yet. `processing` means Safaricom
 * accepted the reversal for processing, not proof it completed; only
 * `succeeded` (confirmed by the async result callback) is that.
 * `failed` covers both an immediate reversal-request rejection and a
 * later async failure — in both cases the order stays `refund_requested`
 * (never auto-reverted) so a staff member can retry.
 */
export type RefundStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export interface RefundAuditEntry {
  action: string;
  actorId: string;
  at: Timestamp;
  note?: string;
}

/**
 * `refunds/{refundId}` — real M-Pesa reversals (§ RefundService + Daraja
 * reversal support), the money-movement counterpart to an order's
 * `refund_requested` status (§ Admin: Orders, which only ever flagged
 * intent, never moved money). Internal/staff-only, never customer-read
 * — unlike `withdrawals`, nobody outside the business needs to see this
 * collection.
 */
export interface Refund extends AuditFields {
  businessId: string;
  orderId: string;
  amountKes: number;
  /** Copied from the order's `statusReason` at request time — why this refund exists. */
  reason: string;
  status: RefundStatus;
  auditTrail: RefundAuditEntry[];
  requestedBy: string;
  /** The real M-Pesa transaction being reversed (`Order.payment.mpesaReceiptNumber` at request time). */
  originalMpesaReceiptNumber: string;
  /** Safaricom's own correlation ids for the reversal request — how the async result callback is matched back to this doc. Null until `initiateReversal` succeeds synchronously. */
  reversalOriginatorConversationId: string | null;
  reversalConversationId: string | null;
  /** Safaricom's own transaction id for the reversal itself, set only once `succeeded`. */
  reversalTransactionId: string | null;
  completedAt: Timestamp | null;
}
