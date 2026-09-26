import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { MachineCommandStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<MachineCommandStatus, BadgeProps['variant']> = {
  pending: 'outline',
  acknowledged: 'secondary',
  completed: 'success',
  failed: 'danger',
  expired: 'warning',
};

const LABEL_FOR_STATUS: Record<MachineCommandStatus, string> = {
  pending: 'Pending',
  acknowledged: 'Acknowledged',
  completed: 'Completed',
  failed: 'Failed',
  expired: 'Expired',
};

export function MachineCommandStatusBadge({ status }: { status: MachineCommandStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{LABEL_FOR_STATUS[status]}</Badge>;
}
