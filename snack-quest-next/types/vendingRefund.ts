import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * How a vending customer got their money back.
 *
 * - `mpesa_reversal`: Snack Quest asked Safaricom to reverse the
 *   customer's M-Pesa payment (the same Daraja Transaction Reversal the
 *   box-order refunds use). Only offered when the sale was the only item
 *   on that payment — a cart shares one M-Pesa payment, and nothing here
 *   assumes Safaricom accepts a partial reversal.
 * - `recorded`: a person sent the money some other way (the M-Pesa
 *   business app, cash at the site) and recorded the confirmation code
 *   here. Snack Quest did not move this money and cannot verify it; the
 *   record says who vouched for it.
 */
export type VendingRefundMethod = 'mpesa_reversal' | 'recorded';

/**
 * `pending`: written just before the reversal request goes to Safaricom.
 * A `pending` that never moves on means the request may or may not have
 * reached Safaricom — never retried automatically; a person checks the
 * M-Pesa statement and records what happened.
 * `processing`: Safaricom accepted the reversal request — not proof it
 * completed. `succeeded`: confirmed (by Safaricom's result callback, or by
 * the person recording a refund they sent). `failed`: the reversal was
 * refused or failed; the sale stays `refund_requested` so it can be
 * tried again.
 */
export type VendingRefundStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export interface VendingRefundAuditEntry {
  action: string;
  actorId: string;
  at: Timestamp;
  note?: string;
}

/**
 * `vendingRefunds/{refundId}` — money returned to a vending customer,
 * one document per attempt. Kept apart from `refunds` (box orders) so a
 * vending refund never shows up as a box-order refund in the Finance
 * ledger or the box-business refund rate. Staff-only; never client-read.
 */
export interface VendingRefund extends AuditFields {
  businessId: string;
  transactionId: string;
  machineId: string;
  amountKes: number;
  method: VendingRefundMethod;
  status: VendingRefundStatus;
  /** Why the money is going back, as the person who started it wrote it. */
  note: string;
  requestedBy: string;
  /** The customer's M-Pesa receipt for the sale (`MachineTransaction.paymentRef`). */
  originalMpesaReceiptNumber: string | null;
  /** Safaricom's correlation ids for a reversal — how the result callback finds this document. Null for a recorded refund. */
  reversalOriginatorConversationId: string | null;
  reversalConversationId: string | null;
  /** Safaricom's own id for the completed reversal. */
  reversalTransactionId: string | null;
  /** For a recorded refund: the confirmation code of the money the person sent. */
  externalReference: string | null;
  completedAt: Timestamp | null;
  auditTrail: VendingRefundAuditEntry[];
}
