import type { MachineTransactionStatus } from '@/types';

/**
 * What each sale state means to the people handling it — the words the
 * sales list, the review queue and the CSV export all use, so a sale is
 * described the same way everywhere.
 */
export const SALE_STATUS_LABEL: Record<MachineTransactionStatus, string> = {
  pending: 'Waiting for payment',
  payment_failed: 'Payment failed',
  paid: 'Paid — dispensing',
  vend_authorized: 'Paid — dispensing',
  dispensed: 'Delivered',
  paid_vend_failed: 'Refund owed',
  refund_requested: 'Refund to send',
  refunded: 'Refunded',
  manual_review: 'Needs checking',
};

/** The statuses someone can filter the sales list by, in the order a person thinks about a sale. */
export const SALE_STATUS_FILTERS: MachineTransactionStatus[] = ['dispensed', 'manual_review', 'paid_vend_failed', 'refund_requested', 'refunded', 'paid', 'vend_authorized', 'pending', 'payment_failed'];
