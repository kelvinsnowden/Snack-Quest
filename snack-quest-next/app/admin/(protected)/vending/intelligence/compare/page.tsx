import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { locationService } from '@/services/locationService';
import { networkIntelligenceService } from '@/services/networkIntelligenceService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IntelligenceTabs } from '@/components/admin/vending/IntelligenceTabs';
import type { LocationDna } from '@/services/locationIntelligenceService';

export const metadata: Metadata = { title: 'Compare locations' };

const MAX = 4;
const kes = (value: number | null) => (value === null ? '—' : `KES ${value.toLocaleString('en-KE')}`);
const peak = (counts: number[], label: (index: number) => string) => {
  const max = Math.max(0, ...counts);
  return max === 0 ? '—' : label(counts.indexOf(max));
};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Up to four locations side by side over the last 30 days. Chosen with the checkboxes; the choice lives in the address so it can be shared. */
export default async function CompareLocationsPage({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const session = await requireStaffSession();
  const raw = (await searchParams).ids;
  const locations = await locationService.listByBusiness(session.businessId);
  const known = new Map(locations.map(({ id, data }) => [id, data]));
  const chosen = Array.from(new Set((Array.isArray(raw) ? raw : raw ? raw.split(',') : []).filter((id) => known.has(id)))).slice(0, MAX);
  const dnas: LocationDna[] = chosen.length > 0 ? await networkIntelligenceService.compareLocations(session.businessId, chosen, 30) : [];
  const names = await snackItemRepository.findManyById(dnas.map((dna) => dna.topProducts[0]?.productId).filter((id): id is string => Boolean(id)));

  const rows: { label: string; value: (dna: LocationDna) => string }[] = [
    { label: 'Machines', value: (dna) => String(dna.machineCount) },
    { label: 'Revenue', value: (dna) => kes(dna.revenueKes) },
    { label: 'Revenue per day', value: (dna) => kes(dna.revenuePerDayKes) },
    { label: 'Units per day', value: (dna) => String(dna.unitsPerDay) },
    { label: 'Average sale', value: (dna) => kes(dna.averageOrderValueKes) },
    { label: 'Gross profit', value: (dna) => kes(dna.grossProfitKes) },
    { label: 'Margin', value: (dna) => (dna.marginPct === null ? '—' : `${dna.marginPct}%`) },
    { label: 'Days with a stockout', value: (dna) => `${dna.stockoutRatePct}%` },
    { label: 'Products carried', value: (dna) => String(dna.assortmentDepth) },
    { label: 'Products that never sold', value: (dna) => String(dna.deadStockProductIds.length) },
    { label: 'Best seller', value: (dna) => (dna.topProducts[0] ? (names.get(dna.topProducts[0].productId)?.name ?? dna.topProducts[0].productId) : '—') },
    { label: 'Busiest hour (Nairobi)', value: (dna) => peak(dna.peakHours, (hour) => `${String(hour).padStart(2, '0')}:00`) },
    { label: 'Busiest day', value: (dna) => peak(dna.peakDays, (day) => DAYS[day]) },
    { label: 'Data', value: (dna) => dna.dataQuality.replace(/_/g, ' ') },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <IntelligenceTabs current="compare" />
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Compare locations</h1>
        <p className="text-sm text-muted-foreground">Pick up to {MAX}. Last 30 days, from daily machine rollups.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Locations</CardTitle>
        </CardHeader>
        <CardContent>
          {locations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No locations yet.</p>
          ) : (
            <form method="get" className="flex flex-col gap-4">
              <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <legend className="sr-only">Locations to compare</legend>
                {locations.map(({ id, data }) => (
                  <label key={id} className="flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" name="ids" value={id} defaultChecked={chosen.includes(id)} className="size-4 rounded border-border" />
                    {data.name}
                  </label>
                ))}
              </fieldset>
              <div>
                <Button type="submit" size="sm">Compare</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {dnas.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">
                      <span className="sr-only">Measure</span>
                    </th>
                    {dnas.map((dna) => (
                      <th key={dna.locationId} scope="col" className="px-6 py-3 font-medium text-foreground">
                        {known.get(dna.locationId)?.name ?? dna.locationId}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((row) => (
                    <tr key={row.label} className="border-b border-border last:border-0">
                      <th scope="row" className="px-6 py-3 text-left font-medium text-muted-foreground">{row.label}</th>
                      {dnas.map((dna) => (
                        <td key={dna.locationId} className="px-6 py-3 text-foreground">{row.value(dna)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
