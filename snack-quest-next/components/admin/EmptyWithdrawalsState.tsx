import { Banknote } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export function EmptyWithdrawalsState({ hasFilter }: { hasFilter: boolean }) {
  return hasFilter ? (
    <EmptyState icon={Banknote} title="No withdrawals match" description="Try a different status filter." />
  ) : (
    <EmptyState
      icon={Banknote}
      title="No withdrawal requests yet"
      description="Requests appear here once a creator asks to cash out their available earnings."
    />
  );
}
