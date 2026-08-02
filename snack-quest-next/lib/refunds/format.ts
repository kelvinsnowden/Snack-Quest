import type { RefundStatus } from '@/types';

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  pending: 'Starting',
  processing: 'Processing — reversal in flight',
  succeeded: 'Refunded',
  failed: 'Failed',
};
