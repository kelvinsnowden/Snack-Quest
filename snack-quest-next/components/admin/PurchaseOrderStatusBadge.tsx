import { Badge, type BadgeProps } from '@/components/ui/badge';
import { PURCHASE_ORDER_STATUS_LABELS } from '@/lib/purchaseOrders/format';
import type { PurchaseOrderStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<PurchaseOrderStatus, BadgeProps['variant']> = {
  draft: 'outline',
  ordered: 'warning',
  received: 'success',
  cancelled: 'danger',
};

export function PurchaseOrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{PURCHASE_ORDER_STATUS_LABELS[status]}</Badge>;
}
