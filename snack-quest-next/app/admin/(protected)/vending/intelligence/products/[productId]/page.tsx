import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { peerLearningService } from '@/services/peerLearningService';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IntelligenceTabs } from '@/components/admin/vending/IntelligenceTabs';
import { LOCATION_TYPE_OPTIONS } from '@/lib/vending/locationOptions';

export const metadata: Metadata = { title: 'Product by location type' };

const typeLabel = (value: string) => LOCATION_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;

/** Where one product sells best, by type of place. A "best type" is named only when at least two types actually sell it. */
export default async function ProductAffinityPage({ params }: { params: Promise<{ productId: string }> }) {
  const session = await requireStaffSession();
  const { productId } = await params;
  const [affinity, items] = await Promise.all([peerLearningService.getProductLocationTypeAffinity(session.businessId, productId, 30), snackItemRepository.findManyById([productId])]);
  const name = items.get(productId)?.name ?? productId;
  const rows = [...affinity.byType].sort((a, b) => b.avgRevenuePerLocationKes - a.avgRevenuePerLocationKes);

  return (
    <div className="flex flex-col gap-6 p-6">
      <IntelligenceTabs current="products" />
      <div>
        <Link href="/admin/vending/intelligence/products" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All products
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{name}</h1>
        <p className="text-sm text-muted-foreground">
          Last {affinity.windowDays} days.{' '}
          {affinity.bestPerformingLocationType
            ? `Sells best at ${typeLabel(affinity.bestPerformingLocationType).toLowerCase()} locations, per location.`
            : 'Not enough different kinds of place sell it yet to say where it does best.'}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>By type of place</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">It hasn’t sold anywhere in this window.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Type</th>
                    <th className="px-6 py-3 text-right font-medium">Locations selling it</th>
                    <th className="px-6 py-3 text-right font-medium">Revenue</th>
                    <th className="px-6 py-3 text-right font-medium">Revenue per location</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((row) => (
                    <tr key={row.locationType} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-medium text-foreground">{typeLabel(row.locationType)}</td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{row.locationCount}</td>
                      <td className="px-6 py-3 text-right text-muted-foreground">KES {row.totalRevenueKes.toLocaleString('en-KE')}</td>
                      <td className="px-6 py-3 text-right text-foreground">KES {row.avgRevenuePerLocationKes.toLocaleString('en-KE')}</td>
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
