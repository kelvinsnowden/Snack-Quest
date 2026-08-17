import type { WithdrawalStatus } from '@/types';

export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  pending: 'Pending review',
  submitting: 'Submitting to M-Pesa…',
  approved: 'Approved — payout in flight',
  paid: 'Paid',
  rejected: 'Rejected',
  failed: 'Failed',
};
