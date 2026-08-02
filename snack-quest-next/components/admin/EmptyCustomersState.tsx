import { Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export function EmptyCustomersState({ hasFilter }: { hasFilter: boolean }) {
  return hasFilter ? (
    <EmptyState icon={Users} title="No customers match" description="Try a different name or phone number." />
  ) : (
    <EmptyState
      icon={Users}
      title="No customers yet"
      description="Customers appear here as soon as their first order is placed through the WhatsApp checkout."
    />
  );
}
