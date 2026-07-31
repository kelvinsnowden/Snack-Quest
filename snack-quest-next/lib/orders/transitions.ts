import type { OrderStatus } from '@/types';

/**
 * The Admin Orders lifecycle (§ Admin: Orders), shared by
 * `services/orderService.ts` (the real, enforced check — every
 * request is validated server-side regardless of what the client
 * sent) and the order-detail action buttons (which only use this to
 * decide what to *show*, never to skip the server check). Deliberately
 * has no `server-only` import so a Client Component can read it too.
 */
export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['dispatched', 'cancelled', 'refund_requested'],
  dispatched: ['delivered', 'refund_requested'],
  delivered: ['refund_requested'],
  cancelled: [],
  refund_requested: [],
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refund_requested: 'Refund requested',
};
