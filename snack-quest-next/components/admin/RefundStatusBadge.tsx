import { Badge, type BadgeProps } from '@/components/ui/badge';
import { REFUND_STATUS_LABELS } from '@/lib/refunds/format';
import type { RefundStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<RefundStatus, BadgeProps['variant']> = {
  pending: 'warning',
  processing: 'default',
  succeeded: 'success',
  failed: 'danger',
};

export function RefundStatusBadge({ status }: { status: RefundStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{REFUND_STATUS_LABELS[status]}</Badge>;
}
