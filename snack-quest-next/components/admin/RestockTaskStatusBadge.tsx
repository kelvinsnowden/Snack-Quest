import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { RestockTaskStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<RestockTaskStatus, BadgeProps['variant']> = {
  draft: 'outline',
  approved: 'secondary',
  picking: 'secondary',
  dispatched: 'secondary',
  in_transit: 'secondary',
  received: 'success',
  partially_received: 'warning',
  cancelled: 'outline',
};

const LABEL_FOR_STATUS: Record<RestockTaskStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  picking: 'Picking',
  dispatched: 'Dispatched',
  in_transit: 'In transit',
  received: 'Received',
  partially_received: 'Partially received',
  cancelled: 'Cancelled',
};

export function RestockTaskStatusBadge({ status }: { status: RestockTaskStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{LABEL_FOR_STATUS[status]}</Badge>;
}
