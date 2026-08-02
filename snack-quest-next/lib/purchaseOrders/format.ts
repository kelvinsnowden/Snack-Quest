import type { PurchaseOrderStatus } from '@/types';

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  received: 'Received',
  cancelled: 'Cancelled',
};
