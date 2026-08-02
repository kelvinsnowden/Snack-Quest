import { MessageCircle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export function EmptyConversationsState({ hasFilter }: { hasFilter: boolean }) {
  return hasFilter ? (
    <EmptyState icon={MessageCircle} title="No conversations match" description="Try a different status filter." />
  ) : (
    <EmptyState
      icon={MessageCircle}
      title="No conversations yet"
      description="Conversations appear here as soon as a customer messages on WhatsApp."
    />
  );
}
