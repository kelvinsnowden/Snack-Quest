import { Badge, type BadgeProps } from '@/components/ui/badge';
import { CONVERSATION_STATUS_LABELS } from '@/lib/conversation/adminLabels';
import type { ConversationStatus } from '@/types';

const VARIANT_FOR_STATUS: Record<ConversationStatus, BadgeProps['variant']> = {
  active: 'outline',
  awaiting_payment: 'secondary',
  agent_assigned: 'warning',
  completed: 'success',
  abandoned: 'danger',
};

export function ConversationStatusBadge({ status }: { status: ConversationStatus }) {
  return <Badge variant={VARIANT_FOR_STATUS[status]}>{CONVERSATION_STATUS_LABELS[status]}</Badge>;
}
