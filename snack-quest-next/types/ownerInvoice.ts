import type { Timestamp } from 'firebase/firestore';

/**
 * `ownerInvoices/{id}` — what a machine owner on invoice billing
 * (`CommercialTerms.ownerBilling: 'invoice'`) owes Snack Quest, shown in
 * their portal and paid there by M-Pesa.
 *
 * One invoice per source, and the source is the doc id, so issuing the
 * same thing twice is a no-op:
 * - `stock_{ownerWholesaleSaleId}`: one delivery of stock, at the owner's
 *   cost basis frozen on that delivery;
 * - `fee_{subscriptionId}_{periodStartMs}`: one period of the machine's
 *   management fee (its `machineSubscriptions` plan).
 *
 * Money and the owner's details, so the security rule denies every client
 * read and write; the Admin SDK is the only reader and writer.
 */
export type OwnerInvoiceKind = 'stock' | 'management_fee';

export type OwnerInvoiceStatus = 'open' | 'paid' | 'void';

export interface OwnerInvoiceLine {
  description: string;
  /** Null on a line that isn't units × price, like a fee. */
  quantity: number | null;
  unitKes: number | null;
  amountKes: number;
}

export interface OwnerInvoicePayment {
  /** `mpesa`: paid from the portal. `recorded`: staff recorded a payment made another way. */
  method: 'mpesa' | 'recorded';
  /** The M-Pesa receipt, or what staff typed (bank reference, etc.). Null when Safaricom confirmed by status query, which carries no receipt. */
  reference: string | null;
  amountKes: number;
  /** `2547…` that paid; null for a recorded payment. */
  phone: string | null;
  paidAtMs: number;
  /** Staff email for a recorded payment; null for M-Pesa. */
  recordedBy: string | null;
}

/** The M-Pesa prompt that is out on someone's phone for this invoice right now. */
export interface OwnerInvoicePendingPrompt {
  checkoutRequestId: string;
  phone: string;
  requestedAtMs: number;
  /** When Safaricom was last asked how it ended, so a polling screen doesn't ask on every poll. */
  lastQueriedAtMs?: number | null;
}

export interface OwnerInvoice {
  businessId: string;
  partnerId: string;
  machineId: string;
  /** `INV-000123`, sequential per business — what the owner sees and what M-Pesa shows as the account. */
  number: string;
  kind: OwnerInvoiceKind;
  /** Where the invoice came from. */
  ownerWholesaleSaleId: string | null;
  subscriptionId: string | null;
  periodStartMs: number | null;
  periodEndMs: number | null;
  lines: OwnerInvoiceLine[];
  totalKes: number;
  /** Delivered units with no price recorded: not on the invoice, never charged at zero — staff see the count. */
  unpricedUnits: number;
  status: OwnerInvoiceStatus;
  issuedAtMs: number;
  dueAtMs: number;
  payment: OwnerInvoicePayment | null;
  pendingPrompt: OwnerInvoicePendingPrompt | null;
  voidReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * `ownerInvoiceCheckouts/{checkoutRequestId}` — one M-Pesa prompt sent for
 * an invoice. What Safaricom's callback is matched by (a read by id, so it
 * never waits on an index), and the record of how each attempt ended.
 */
export type OwnerInvoiceCheckoutOutcome = 'pending' | 'paid' | 'failed' | 'amount_mismatch' | 'already_settled';

export interface OwnerInvoiceCheckout {
  businessId: string;
  invoiceId: string;
  phone: string;
  amountKes: number;
  requestedAtMs: number;
  outcome: OwnerInvoiceCheckoutOutcome;
  resultCode: number | null;
  resultDesc: string | null;
  mpesaReceiptNumber: string | null;
  paidAmountKes: number | null;
  resolvedAtMs: number | null;
  /** `callback` or `status_query` — how the outcome became known. */
  resolvedBy: 'callback' | 'status_query' | null;
}

export const OWNER_INVOICE_KIND_LABEL: Record<OwnerInvoiceKind, string> = {
  stock: 'Snacks delivered',
  management_fee: 'Management fee',
};
