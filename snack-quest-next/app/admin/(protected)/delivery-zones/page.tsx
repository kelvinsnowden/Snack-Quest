import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { deliveryZoneService } from '@/services/deliveryZoneService';
import { DeliveryZoneTable } from '@/components/admin/DeliveryZoneTable';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { MapPinned } from 'lucide-react';

export const metadata: Metadata = { title: 'Delivery zones' };

export default async function AdminDeliveryZonesPage() {
  const session = await requireStaffSession();
  const { zones, unzonedStationCount } = await deliveryZoneService.listZones(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Delivery zones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set the pickup delivery fee for every zone. Changes apply immediately to every station in that zone — 0 means
          intentionally free pickup.
        </p>
      </div>

      {zones.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={MapPinned}
            title="No delivery zones yet"
            description="Pickup stations need to be seeded before zones can be priced."
          />
        </Card>
      ) : (
        <DeliveryZoneTable zones={zones} unzonedStationCount={unzonedStationCount} />
      )}
    </div>
  );
}
