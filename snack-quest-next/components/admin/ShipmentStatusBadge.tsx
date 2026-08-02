import { Badge, type BadgeProps } from '@/components/ui/badge';
import { SHIPMENT_STATUS_LABELS } from '@/lib/delivery/transitions';
import type { ShipmentStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<ShipmentStatus, BadgeProps['variant']> = {
  pending: 'outline',
  pending_manual_booking: 'warning',
  created: 'default',
  in_transit: 'secondary',
  delivered: 'success',
  failed: 'danger',
};

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{SHIPMENT_STATUS_LABELS[status]}</Badge>;
}
