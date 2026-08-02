import { PackageSearch, ShoppingBag } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export function EmptyOrdersState({ hasFilter }: { hasFilter: boolean }) {
  return hasFilter ? (
    <EmptyState
      icon={PackageSearch}
      title="No orders match"
      description="Try a different name, phone number, or status filter."
    />
  ) : (
    <EmptyState
      icon={ShoppingBag}
      title="No orders yet"
      description="Orders placed through the WhatsApp checkout will show up here as soon as a customer completes payment."
    />
  );
}
