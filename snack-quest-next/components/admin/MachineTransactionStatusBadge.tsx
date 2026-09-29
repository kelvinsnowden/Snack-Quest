import { Badge, type BadgeProps } from '@/components/ui/badge';
import { SALE_STATUS_LABEL } from '@/lib/vending/saleStatus';
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

/** A sale's state in the same words on every screen (`SALE_STATUS_LABEL`). */
export function MachineTransactionStatusBadge({ status }: { status: MachineTransactionStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{SALE_STATUS_LABEL[status]}</Badge>;
}
