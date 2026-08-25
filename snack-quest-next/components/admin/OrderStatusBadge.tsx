import { Badge, type BadgeProps } from '@/components/ui/badge';
import { ORDER_STATUS_LABELS } from '@/lib/orders/transitions';
import type { Dictionary } from '@/lib/i18n/dictionaries/en';
import type { OrderStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<OrderStatus, BadgeProps['variant']> = {
  pending: 'outline',
  confirmed: 'default',
  dispatched: 'secondary',
  delivered: 'success',
  cancelled: 'outline',
  refund_requested: 'warning',
  refunded: 'danger',
};

/**
 * `dict` is optional so the dozens of existing call sites keep working
 * untouched and keep rendering English. Passing one translates the
 * label — the badge itself has no way to reach a locale, since it is
 * rendered from both Server and Client Components.
 */
export function OrderStatusBadge({ status, dict }: { status: OrderStatus; dict?: Dictionary }) {
  return (
    <Badge variant={VARIANT_FOR_STATUS[status]}>
      {dict?.orderStatus[status] ?? ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}
