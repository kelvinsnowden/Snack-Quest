import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPinned, Plus } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { locationService } from '@/services/locationService';
import { machineRepository } from '@/repositories/machineRepository';
import { locationTypeLabel } from '@/lib/vending/locationOptions';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Locations' };

/** Every place a machine stands, or will. */
export default async function LocationsPage() {
  const session = await requireStaffSession();
  const [locations, machines] = await Promise.all([locationService.listByBusiness(session.businessId), machineRepository.listAllForBusiness(session.businessId)]);
  const count = new Map<string, number>();
  for (const { data } of machines) {
    if (data.locationId && data.status !== 'decommissioned') count.set(data.locationId, (count.get(data.locationId) ?? 0) + 1);
  }
  const rows = [...locations].sort((a, b) => a.data.name.localeCompare(b.data.name));
  const canManage = hasPermission(session, 'locations.manage');

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Locations</h1>
          <p className="text-sm text-muted-foreground">{rows.length} location{rows.length === 1 ? '' : 's'}</p>
        </div>
        {canManage ? (
          <Link href="/admin/vending/locations/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" aria-hidden="true" />
            New location
          </Link>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={MapPinned} title="No locations yet" description="Add the places your machines stand, so sales can be compared site by site." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="px-6 py-3 font-medium">Name</th>
                    <th scope="col" className="px-6 py-3 font-medium">Type</th>
                    <th scope="col" className="px-6 py-3 font-medium">City / area</th>
                    <th scope="col" className="px-6 py-3 text-right font-medium">Machines</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ id, data }) => (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-6 py-3"><Link href={`/admin/vending/locations/${id}`} className="font-medium text-primary hover:underline">{data.name}</Link></td>
                      <td className="px-6 py-3 text-muted-foreground">{locationTypeLabel(data.locationType)}</td>
                      <td className="px-6 py-3 text-muted-foreground">{[data.city, data.area].filter(Boolean).join(' · ')}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-foreground">{count.get(id) ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
