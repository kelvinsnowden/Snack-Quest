import type { Metadata } from 'next';
import Link from 'next/link';
import { Banknote, Package, TrendingUp, AlertTriangle, Boxes } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { networkIntelligenceService } from '@/services/networkIntelligenceService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendStatCard } from '@/components/admin/TrendStatCard';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Network Intelligence' };

/**
 * The whole-fleet Snack Intelligence overview (§ NETWORK INTELLIGENCE,
 * docs/SNACK_INTELLIGENCE.md). Composed from `networkDailySummary`
 * rollups through `networkIntelligenceService`, not a live scan —
 * exactly what the brief requires ("use rollups, do not scan raw
 * transaction collections on every dashboard").
 */
export default async function AdminVendingIntelligencePage() {
  const session = await requireStaffSession();
  const overview = await networkIntelligenceService.getNetworkOverview(session.businessId, 30);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Network Intelligence</h1>
          <p className="text-sm text-muted-foreground">Last {overview.windowDays} days, across {overview.machineCount} machines and {overview.locationCount} locations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/vending/intelligence/locations" className="text-sm font-medium text-primary hover:underline">Location Intelligence →</Link>
          <Link href="/admin/vending/intelligence/products" className="text-sm font-medium text-primary hover:underline">Product Intelligence →</Link>
          <Link href="/admin/vending/intelligence/recommendations" className="text-sm font-medium text-primary hover:underline">Recommendations →</Link>
        </div>
      </div>

      {overview.dataQuality === 'insufficient_data' ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          Not enough rolled-up days in this window yet — the numbers below may be thin. Data quality: {overview.dataQuality}.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <TrendStatCard label="Revenue" value={`KES ${overview.revenueKes.toLocaleString('en-KE')}`} icon={<Banknote className="size-5" />} tone="success" />
        <TrendStatCard label="Units sold" value={overview.unitsSold.toLocaleString('en-KE')} icon={<Package className="size-5" />} tone="primary" />
        <TrendStatCard label="Gross profit" value={`KES ${overview.grossProfitKes.toLocaleString('en-KE')}`} icon={<TrendingUp className="size-5" />} tone="success" />
        <TrendStatCard label="Margin" value={overview.marginPct !== null ? `${overview.marginPct}%` : '—'} icon={<TrendingUp className="size-5" />} tone="secondary" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <TrendStatCard label="Avg order value" value={overview.averageOrderValueKes !== null ? `KES ${overview.averageOrderValueKes.toLocaleString('en-KE')}` : '—'} icon={<Banknote className="size-5" />} />
        <TrendStatCard label="Inventory deployed" value={`${overview.inventoryUnitsDeployed.toLocaleString('en-KE')} units`} icon={<Boxes className="size-5" />} />
        <TrendStatCard label="Inventory value" value={`KES ${overview.inventoryValueKes.toLocaleString('en-KE')}`} icon={<Boxes className="size-5" />} />
        <TrendStatCard label="Stockout snapshots" value={overview.stockoutSnapshotCount.toLocaleString('en-KE')} icon={<AlertTriangle className="size-5" />} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top categories</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {overview.topCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categorized sales yet in this window.</p>
          ) : (
            overview.topCategories.map((c) => (
              <Badge key={c.category} variant="secondary">
                {c.category}: KES {c.revenueKes.toLocaleString('en-KE')} ({c.unitsSold} units)
              </Badge>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fastest-growing categories</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {overview.fastestGrowingCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not enough data to compare first vs. second half of the window yet.</p>
          ) : (
            overview.fastestGrowingCategories.map((c) => (
              <div key={c.category} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                <span className="text-sm font-medium text-foreground">{c.category}</span>
                <span className="text-sm text-muted-foreground">
                  {c.growthPct === null ? 'no prior-period revenue to compare against' : `${c.growthPct > 0 ? '+' : ''}${c.growthPct}%`}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
