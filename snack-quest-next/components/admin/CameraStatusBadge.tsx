import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { CameraStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<CameraStatus, BadgeProps['variant']> = {
  not_configured: 'outline',
  configured: 'secondary',
  testing: 'secondary',
  active: 'success',
  error: 'danger',
  disabled: 'outline',
};

const LABEL_FOR_STATUS: Record<CameraStatus, string> = {
  not_configured: 'Not configured',
  configured: 'Configured',
  testing: 'Testing',
  active: 'Active',
  error: 'Error',
  disabled: 'Disabled',
};

export function CameraStatusBadge({ status }: { status: CameraStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{LABEL_FOR_STATUS[status]}</Badge>;
}
