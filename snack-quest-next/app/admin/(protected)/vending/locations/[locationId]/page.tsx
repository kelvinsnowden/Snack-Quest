import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { locationService } from '@/services/locationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MachineStatusBadge } from '@/components/admin/MachineStatusBadge';
import { LocationForm } from '@/components/admin/vending/LocationForm';

export const metadata: Metadata = { title: 'Location' };

const str = (value: string | number | null | undefined) => (value === null || value === undefined ? '' : String(value));

export default async function LocationPage({ params }: { params: Promise<{ locationId: string }> }) {
  const session = await requireStaffSession();
  const { locationId } = await params;
  const [location, machines] = await Promise.all([locationService.findById(session.businessId, locationId), locationService.machinesAtLocation(session.businessId, locationId)]);
  if (!location) notFound();
  const canManage = hasPermission(session, 'locations.manage');

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href="/admin/vending/locations" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Locations
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-foreground">{location.name}</h1>
          {hasPermission(session, 'analytics.vending.view') ? (
            <Link href={`/admin/vending/intelligence/locations/${locationId}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <BarChart3 className="size-4" aria-hidden="true" />
              How this location sells
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <LocationForm
              locationId={locationId}
              canEdit={canManage}
              initial={{
                name: location.name,
                locationType: location.locationType,
                city: location.city,
                area: str(location.area),
                address: str(location.address),
                latitude: str(location.latitude),
                longitude: str(location.longitude),
                estimatedFootTraffic: str(location.estimatedFootTraffic),
                operatingHours: str(location.operatingHours),
                customerType: str(location.customerType),
                indoorOutdoor: str(location.indoorOutdoor),
                notes: str(location.notes),
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Machines here</CardTitle>
          </CardHeader>
          <CardContent>
            {machines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No machine is here yet. Move one here from its machine page.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {machines.map(({ id, data }) => (
                  <li key={id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/admin/vending/${id}`} className="font-medium text-primary hover:underline">{data.machineCode}</Link>
                    <MachineStatusBadge status={data.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
