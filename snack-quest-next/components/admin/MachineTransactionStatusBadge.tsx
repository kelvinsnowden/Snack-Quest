import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { MachineTransactionStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<MachineTransactionStatus, BadgeProps['variant']> = {
  pending: 'outline',
  payment_failed: 'outline',
  paid: 'secondary',
  vend_authorized: 'secondary',
  dispensed: 'success',
  paid_vend_failed: 'danger',
  refund_requested: 'warning',
  refunded: 'outline',
  manual_review: 'danger',
};

const LABEL_FOR_STATUS: Record<MachineTransactionStatus, string> = {
  pending: 'Pending payment',
  payment_failed: 'Payment failed',
  paid: 'Paid',
  vend_authorized: 'Vend authorized',
  dispensed: 'Dispensed',
  paid_vend_failed: 'Paid — vend failed',
  refund_requested: 'Refund requested',
  refunded: 'Refunded',
  manual_review: 'Needs review',
};

export function MachineTransactionStatusBadge({ status }: { status: MachineTransactionStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{LABEL_FOR_STATUS[status]}</Badge>;
}
