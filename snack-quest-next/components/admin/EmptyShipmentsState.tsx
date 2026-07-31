import { Truck } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export function EmptyShipmentsState({ hasFilter }: { hasFilter: boolean }) {
  return hasFilter ? (
    <EmptyState icon={Truck} title="No shipments match" description="Try a different status filter." />
  ) : (
    <EmptyState
      icon={Truck}
      title="No shipments yet"
      description="A shipment is created automatically the moment an order is confirmed."
    />
  );
}
