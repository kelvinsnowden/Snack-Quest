import type { ConversationStatus } from '@/types';

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  active: 'Active',
  awaiting_payment: 'Awaiting payment',
  agent_assigned: 'Needs an agent',
  completed: 'Completed',
  abandoned: 'Abandoned',
};
