import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffSession } from '@/lib/auth/session';
import { locationService } from '@/services/locationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Location Intelligence' };

/** Every profiled location (§ LOCATION PROFILE) — machine count is always derived at read time, never a stored counter that could drift. */
export default async function AdminLocationIntelligenceListPage() {
  const session = await requireStaffSession();
  const rows = await locationService.listByBusiness(session.businessId);
  const withMachineCounts = await Promise.all(
    rows.map(async ({ id, data }) => ({ id, data, machineCount: (await locationService.machinesAtLocation(session.businessId, id)).length })),
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Location Intelligence</h1>
        <p className="text-sm text-muted-foreground">Every profiled location — click through for its own Location DNA.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Locations ({withMachineCounts.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {withMachineCounts.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No locations profiled yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 font-medium">City</th>
                    <th className="px-6 py-3 font-medium">Machines</th>
                  </tr>
                </thead>
                <tbody>
                  {withMachineCounts.map(({ id, data, machineCount }) => (
                    <tr key={id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">
                        <Link href={`/admin/vending/intelligence/locations/${id}`} className="hover:underline">
                          {data.name}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant="outline">{data.locationType.replace('_', ' ')}</Badge>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{data.city}</td>
                      <td className="px-6 py-3 text-muted-foreground">{machineCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
