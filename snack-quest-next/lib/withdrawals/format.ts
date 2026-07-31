import type { WithdrawalStatus } from '@/types';

export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved — payout in flight',
  paid: 'Paid',
  rejected: 'Rejected',
  failed: 'Failed',
};
