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

/**
 * How money reached the business when it did not arrive through
 * Daraja (§ super-admin manual payment orders) — cash at a stand, an
 * M-Pesa transfer the customer sent themselves and read the code out
 * over the phone, or a bank transfer.
 *
 * `mpesa_manual` is deliberately distinct from a normal Daraja
 * payment: the money genuinely arrived over M-Pesa, but *this system
 * never saw the callback that proves it* — a staff member typed the
 * code in. Collapsing the two would make an asserted payment
 * indistinguishable from a verified one in every report that reads
 * this collection, which is precisely the distinction that matters
 * when the books are wrong.
 */
export type ManualPaymentMethod = 'cash' | 'mpesa_manual' | 'bank_transfer';

export interface ManualPaymentRecord {
  method: ManualPaymentMethod;
  /**
   * The M-Pesa code or bank reference. Required for every method but
   * `'cash'`, which genuinely has no reference to record — the
   * accountable artifact there is `recordedByUid`, not a receipt.
   */
  reference: string | null;
  /** Who asserted the money arrived. Never derived from the request body — always the authenticated super admin's own uid. */
  recordedByUid: string;
  recordedByName: string;
  note: string | null;
  recordedAt: Timestamp;
}

export interface PaymentIntent {
  businessId: string;
  conversationId: string;
  conversationCheckoutSnapshotId: string;
  customerId: string | null;
  phoneNumber: string;
  amountKes: number;
  status: PaymentIntentStatus;
  /**
   * Set only when this intent was settled by a super admin asserting
   * payment already arrived, rather than by a Daraja callback. Absent
   * on every Daraja-settled intent and on every intent predating this
   * field, so `manualPayment == null` reads as "settled the normal
   * way" without a backfill.
   *
   * An intent carrying this has no `attempts` subcollection entry,
   * since no STK push was ever made — which is also why the
   * reconciliation view (built on unmatched *webhook events*) never
   * sees these: there is no callback to be unmatched.
   */
  manualPayment?: ManualPaymentRecord | null;
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
