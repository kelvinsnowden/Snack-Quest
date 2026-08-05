import type { OrderStatus } from '@/types';

/** The only statuses a real shopping trip can be recorded against — never a cancelled/refunded/refund-requested order, and never the transient `pending` status. Shared by the service (authoritative) and the Orders table (so an ineligible row is never even offered for selection). */
export const BATCHABLE_ORDER_STATUSES: OrderStatus[] = ['confirmed', 'dispatched', 'delivered'];

export function isOrderBatchable(status: OrderStatus, fulfillmentBatchId: string | null): boolean {
  return fulfillmentBatchId === null && BATCHABLE_ORDER_STATUSES.includes(status);
}
