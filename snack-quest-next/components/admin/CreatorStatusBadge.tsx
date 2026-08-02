import { Badge, type BadgeProps } from '@/components/ui/badge';
import { CREATOR_STATUS_LABELS } from '@/lib/creators/transitions';
import type { CreatorStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<CreatorStatus, BadgeProps['variant']> = {
  pending: 'warning',
  active: 'success',
  suspended: 'danger',
};

export function CreatorStatusBadge({ status }: { status: CreatorStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{CREATOR_STATUS_LABELS[status]}</Badge>;
}
