import { Badge, type BadgeProps } from '@/components/ui/badge';
import { ORDER_STATUS_LABELS } from '@/lib/orders/transitions';
import type { OrderStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<OrderStatus, BadgeProps['variant']> = {
  pending: 'outline',
  confirmed: 'default',
  dispatched: 'secondary',
  delivered: 'success',
  cancelled: 'outline',
  refund_requested: 'warning',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}
