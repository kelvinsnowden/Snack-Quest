import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { MachineConnectivityStatus } from '@/types';

/** Derived from `lastSeenAt` at read time (`lib/vending/connectivity.ts`) — never a stored field, so this badge can never disagree with the timestamp it's computed from. */
const VARIANT_FOR_CONNECTIVITY: Record<MachineConnectivityStatus, BadgeProps['variant']> = {
  online: 'success',
  stale: 'warning',
  offline: 'danger',
  unknown: 'outline',
};

const LABEL_FOR_CONNECTIVITY: Record<MachineConnectivityStatus, string> = {
  online: 'Online',
  stale: 'Stale',
  offline: 'Offline',
  unknown: 'No signal yet',
};

export function MachineConnectivityBadge({ status }: { status: MachineConnectivityStatus }) {
  return <Badge variant={VARIANT_FOR_CONNECTIVITY[status]}>{LABEL_FOR_CONNECTIVITY[status]}</Badge>;
}
