import type { Timestamp } from 'firebase/firestore';

/**
 * `paymentIntents/{intentId}` — separate from `orders` by design
 * (PLATFORM_ARCHITECTURE_V2.md §7). An order only exists once a
 * payment has actually succeeded; this collection tracks the attempt
 * to get there, including failed and abandoned attempts an order-only
 * model would have no place to record.
 */
export type PaymentIntentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'expired';

export interface PaymentIntent {
  businessId: string;
  conversationId: string;
  conversationCheckoutSnapshotId: string;
  customerId: string | null;
  phoneNumber: string;
  amountKes: number;
  status: PaymentIntentStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** `paymentIntents/{intentId}/attempts/{attemptId}` — one per STK push. */
export type PaymentAttemptStatus = 'initiated' | 'succeeded' | 'failed';

export interface PaymentAttempt {
  checkoutRequestId: string;
  merchantRequestId: string;
  status: PaymentAttemptStatus;
  resultCode: number | null;
  resultDesc: string | null;
  mpesaReceiptNumber: string | null;
  initiatedAt: Timestamp;
  resolvedAt: Timestamp | null;
  /** How many times the STK Push Query reconciliation sweep has asked Daraja about this attempt (§ Daraja Production Integration Verification Audit §2.4/§7) — bounds the sweep's own retries per attempt, independent of how many sweep runs have happened. 0 until the first query. */
  queryAttemptCount: number;
}
