import type { Timestamp } from 'firebase/firestore';
import type { DispenseResultStatus } from '@/lib/vending/hardwareAdapter';

/**
 * `machineTransactions/{transactionId}` — one vend attempt, immutable
 * once written except through the status transitions below
 * (§ CORE ENTITIES 3, docs/FLEET_ARCHITECTURE_AUDIT.md §8).
 *
 * The whole reason this exists as its own collection, separate from
 * `orders`: **a machine reporting "dispensed" is not proof a customer
 * paid, and a payment succeeding is not proof the box came out**
 * (§ financial correctness, the vending brief's own instruction).
 * Those are two different systems reporting two different facts, and
 * this type keeps them as two different fields rather than one status
 * that could only ever describe one of them at a time:
 *
 *   - `paymentRef` / `paidAt` — set only by the server, only once
 *     `PaymentService`'s own Daraja callback verification succeeds.
 *     Never set from a device payload; a device does not know whether
 *     a customer paid, only whether it was told to dispense.
 *   - `vendRef` / `dispensedAt` / `failureReason` — set only from a
 *     device's own vend-result report, carried through
 *     `machineTelemetryEvents` first (§ raw telemetry is not trusted
 *     financial data) and applied here only after that report passes
 *     the idempotency check.
 *
 * `status` is the summary state machine over both facts, not a third
 * independent fact — see `MACHINE_TRANSACTION_STATUS_TRANSITIONS`for
 * every move the service will actually allow. `paid_vend_failed` is
 * the state this collection exists to make representable at all: a
 * customer whose payment succeeded and whose box did not come out is
 * the one case that must never be lost in a flattened "success/fail"
 * status, because it is the one case that owes somebody money back.
 */
export type MachineTransactionStatus =
  | 'pending'
  | 'payment_failed'
  | 'paid'
  | 'vend_authorized'
  | 'dispensed'
  | 'paid_vend_failed'
  | 'refund_requested'
  | 'refunded'
  /**
   * A `paid`/`vend_authorized` transaction that sat past the
   * reconciliation sweep's own threshold with no device report ever
   * arriving — the machine went offline mid-vend, or its report was
   * lost, and nothing else will ever move this transaction on its
   * own. Mirrors `PaymentIntentStatus.expired`: money was taken, the
   * outcome is genuinely unknown, and a human needs to look. Still
   * reachable *out of* by a late device report (a machine that
   * reconnects a day later and reports what actually happened is
   * more authoritative than the sweep's own guess) — see
   * `MACHINE_TRANSACTION_STATUS_TRANSITIONS`.
   */
  | 'manual_review';

/**
 * `diagnostic` is a staff test vend (the admin "Test vend" action): it
 * goes through the same dispense ledger as a sale — so it is delivered,
 * tracked and never duplicated the same way — but no customer paid for
 * it (amount 0). It is never a sale: not revenue, not units sold, not a
 * refund owed, and its stock leaves as `waste`, not `sale`.
 */
export type MachineTransactionPaymentMethod = 'mpesa' | 'cash' | 'other' | 'diagnostic';

/** Whether a transaction is a customer's purchase — everything that counts sales, revenue or refunds owed must skip the rest. */
export function isCustomerSale(transaction: Pick<MachineTransaction, 'paymentMethod'>): boolean {
  return transaction.paymentMethod !== 'diagnostic';
}

export interface MachineTransaction {
  businessId: string;
  machineId: string;
  slotId: string;
  /** References `packages/{packageId}` or `snackItems/{snackItemId}` — same catalogue `MachineSlot.productId` points at, copied at the moment of sale so a later price/slot change never rewrites history. */
  productId: string;
  productCatalogue: 'package' | 'snackItem';
  /** Snack Quest's own reference, generated at creation — what the customer's receipt and the machine's touchscreen both show. */
  transactionRef: string;
  /**
   * The verified payment's own reference — a Daraja M-Pesa receipt
   * number, or a `paymentIntents/{intentId}` id for anything routed
   * through the existing `PaymentService`. Null until payment is
   * actually verified; never set from anything the device reports.
   */
  paymentRef: string | null;
  /**
   * Safaricom's own correlation pair for the STK push this
   * transaction's payment was collected through — set once, at
   * `initiateMpesaPayment`, before any callback exists to verify.
   * This is what the Daraja webhook route's vending branch looks the
   * transaction up by; it is never itself proof of payment, which is
   * still only `paymentRef`/`paidAt`. Null for a transaction created
   * without ever attempting an M-Pesa collection (`paymentMethod`
   * `'cash'`/`'other'`).
   */
  checkoutRequestId: string | null;
  merchantRequestId: string | null;
  /** Set once a vend is authorized and handed to the hardware adapter (§ hardware abstraction `authorizeVend()`) — the token/reference the adapter and the machine both use to correlate the eventual result. Null until authorized. */
  vendRef: string | null;
  amountKes: number;
  currency: 'KES';
  paymentMethod: MachineTransactionPaymentMethod;
  status: MachineTransactionStatus;
  /** Set only from a verified payment event — never from a device payload. */
  paidAt: Timestamp | null;
  /** Set only from a verified, idempotency-checked device vend-result report. */
  dispensedAt: Timestamp | null;
  /** Present only when `status` is `paid_vend_failed`, `refund_requested` or `refunded` — the machine/adapter's own reported reason, kept verbatim for the refund conversation, never interpreted as more than that. */
  failureReason: string | null;
  /** The normalized `DispenseResultStatus` (`lib/vending/hardwareAdapter.ts`) a device report carried, when one has been applied — `null` for a transaction moved to `manual_review` by the timeout sweep instead (§ transaction timeout), which never received a device report at all. `'unknown'` is the one value that itself explains why `status` is `manual_review` rather than `paid_vend_failed` — the device couldn't say what happened, so this codebase doesn't guess either. */
  dispenseFailureStatus: DispenseResultStatus | null;
  /** The raw `machineTelemetryEvents` idempotency key this transaction's vend result was applied from — lets a duplicate device report be recognised and ignored rather than double-processed. Null until a vend result has actually been applied. */
  appliedTelemetryEventId: string | null;
  /**
   * Set when the machine reported an outcome that contradicts one
   * already acted on — e.g. "dispensed" arriving after the refund
   * decision. The physical fact is recorded (stock moves, an operator is
   * alerted); the money side is never silently flipped. Absent on
   * transactions written before conflicts were modelled.
   */
  outcomeConflict?: {
    reportedStatus: DispenseResultStatus;
    previousStatus: MachineTransactionStatus;
    reportedAt: Timestamp;
    source: string;
    resolved: boolean;
  } | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * The state machine `MachineTransactionService` enforces. Every
 * legal move is listed; anything not listed is rejected rather than
 * silently allowed — the same discipline `MACHINE_STATUS_TRANSITIONS`
 * uses for the machine itself.
 */
export const MACHINE_TRANSACTION_STATUS_TRANSITIONS: Record<
  MachineTransactionStatus,
  MachineTransactionStatus[]
> = {
  // `manual_review` direct from `pending` covers one narrow case: a
  // Daraja callback claims success for this transaction's own
  // `checkoutRequestId` but the amount doesn't match what was
  // charged for — real money moved, our records disagree, and a
  // human has to look. See `machineTransactionService.handleMpesaCallback`.
  pending: ['payment_failed', 'paid', 'manual_review'],
  payment_failed: [],
  // `paid_vend_failed` is reachable directly from `paid`, not only
  // through `vend_authorized` — a machine that refuses the
  // authorization outright (offline, slot empty, slot disabled) never
  // reaches "authorized" at all, and the customer's money still needs
  // the same refund path either way.
  // `dispensed` directly from `paid`: the command ledger is written before
  // the sale, so if the dispatcher dies between queuing the dispense and
  // recording it here, the machine can collect, dispense and report while
  // the sale still says `paid`. That report — matched to a dispatched
  // command — is the truth, and must not be refused.
  paid: ['vend_authorized', 'dispensed', 'paid_vend_failed', 'manual_review'],
  vend_authorized: ['dispensed', 'paid_vend_failed', 'manual_review'],
  dispensed: [],
  // `manual_review` from the refund path covers one case only: the
  // machine reported the product *was* dispensed after we had decided to
  // refund. Until the money has actually gone back, a human decides.
  paid_vend_failed: ['refund_requested', 'manual_review'],
  refund_requested: ['refunded', 'manual_review'],
  refunded: [],
  // A late device report is more authoritative than the sweep's own
  // guess that nothing would ever arrive — if one does, it resolves
  // this the same way it would have resolved `vend_authorized`
  // directly, rather than being stuck behind a terminal state.
  manual_review: ['dispensed', 'paid_vend_failed', 'refund_requested'],
};
