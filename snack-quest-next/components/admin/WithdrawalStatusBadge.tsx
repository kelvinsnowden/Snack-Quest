import { Badge, type BadgeProps } from '@/components/ui/badge';
import { WITHDRAWAL_STATUS_LABELS } from '@/lib/withdrawals/format';
import type { WithdrawalStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<WithdrawalStatus, BadgeProps['variant']> = {
  pending: 'warning',
  approved: 'default',
  paid: 'success',
  rejected: 'outline',
  failed: 'danger',
};

export function WithdrawalStatusBadge({ status }: { status: WithdrawalStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{WITHDRAWAL_STATUS_LABELS[status]}</Badge>;
}
