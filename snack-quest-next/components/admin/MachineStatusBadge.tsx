import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { MachineStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<MachineStatus, BadgeProps['variant']> = {
  provisioning: 'outline',
  installing: 'outline',
  testing: 'secondary',
  active: 'success',
  maintenance: 'warning',
  offline: 'danger',
  decommissioned: 'outline',
};

const LABEL_FOR_STATUS: Record<MachineStatus, string> = {
  provisioning: 'Provisioning',
  installing: 'Installing',
  testing: 'Testing',
  active: 'Active',
  maintenance: 'Maintenance',
  offline: 'Offline',
  decommissioned: 'Decommissioned',
};

export function MachineStatusBadge({ status }: { status: MachineStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{LABEL_FOR_STATUS[status]}</Badge>;
}
