import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { networkIntelligenceService } from '@/services/networkIntelligenceService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IntelligenceTabs } from '@/components/admin/vending/IntelligenceTabs';
import { LOCATION_TYPE_OPTIONS } from '@/lib/vending/locationOptions';

export const metadata: Metadata = { title: 'Location types' };

const typeLabel = (value: string) => LOCATION_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;

/** How each kind of place performs, from the last 30 days of daily machine rollups. Averages are per location, not per machine. */
export default async function LocationTypesPage() {
  const session = await requireStaffSession();
  const rows = (await networkIntelligenceService.getLocationTypePerformance(session.businessId, 30)).sort((a, b) => b.revenuePerLocationKes - a.revenuePerLocationKes);

  return (
    <div className="flex flex-col gap-6 p-6">
      <IntelligenceTabs current="location-types" />
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Location types</h1>
        <p className="text-sm text-muted-foreground">Last 30 days. A type with one location is one site’s result, not a pattern.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>By type of place</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No locations with sales yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 text-right font-medium">Locations</th>
                    <th className="px-6 py-3 text-right font-medium">Units</th>
                    <th className="px-6 py-3 text-right font-medium">Revenue</th>
                    <th className="px-6 py-3 text-right font-medium">Revenue per location</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((row) => (
                    <tr key={row.locationType} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">{typeLabel(row.locationType)}</td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{row.locationCount}</td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{row.unitsSold.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-right text-muted-foreground">KES {row.revenueKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-right text-foreground">KES {row.revenuePerLocationKes.toLocaleString('en-KE')}</td>
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
