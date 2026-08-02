import { Megaphone } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export function EmptyCreatorsState({ hasFilter }: { hasFilter: boolean }) {
  return hasFilter ? (
    <EmptyState icon={Megaphone} title="No creators match" description="Try a different status filter." />
  ) : (
    <EmptyState
      icon={Megaphone}
      title="No creators yet"
      description="Creators appear here once they sign up and complete onboarding through the Creator Portal."
    />
  );
}
