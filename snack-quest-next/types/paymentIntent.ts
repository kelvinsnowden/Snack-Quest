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
  /**
   * Who asserted the money arrived. Never derived from the request
   * body — always the authenticated super admin's own uid.
   *
   * Never overwritten by a later correction either. If someone typed
   * the wrong M-Pesa code, the person who vouched for the payment is
   * still the person who vouched for it; replacing them with whoever
   * fixed the typo would erase the only accountability record this
   * kind of payment has.
   */
  recordedByUid: string;
  recordedByName: string;
  note: string | null;
  recordedAt: Timestamp;
  /**
   * Set when a super admin corrected the details afterwards
   * (§ correcting a manually recorded payment) — a mistyped M-Pesa
   * code, the wrong method picked. Absent means the record still says
   * exactly what was first entered, which is the common case and the
   * one the books should be able to assume.
   */
  correctedByUid?: string;
  correctedByName?: string;
  correctedAt?: Timestamp;
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
  /**
   * When Daraja was last asked about this attempt — what spaces the
   * queries out (§ payment auto-recovery). The count alone could not:
   * the payment screen polls every 3 seconds, so it spent the entire
   * per-attempt budget within seconds of the first query and left
   * nothing for the sweep that runs after the customer has closed the
   * tab. Absent on an attempt written before this existed, which reads
   * as "never queried" and is correct.
   */
  lastQueriedAt?: Timestamp | null;
}
