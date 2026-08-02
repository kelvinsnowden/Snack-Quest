import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { SubmissionStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<SubmissionStatus, BadgeProps['variant']> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const LABEL_FOR_STATUS: Record<SubmissionStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
};

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{LABEL_FOR_STATUS[status]}</Badge>;
}
