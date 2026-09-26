import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { locationService } from '@/services/locationService';
import { locationIntelligenceService, LocationNotFoundError } from '@/services/locationIntelligenceService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Location detail' };

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => `${h}:00`);
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** One location's Location DNA (§ LOCATION DNA) — every figure calculated from real rollup/assortment data, never hard-coded. */
export default async function AdminLocationIntelligenceDetailPage({ params }: { params: Promise<{ locationId: string }> }) {
  const session = await requireStaffSession();
  const { locationId } = await params;

  const location = await locationService.findById(session.businessId, locationId);
  if (!location) {
    notFound();
  }

  let dna;
  try {
    dna = await locationIntelligenceService.getLocationDna(session.businessId, locationId, 30);
  } catch (error) {
    if (error instanceof LocationNotFoundError) {
      notFound();
    }
    throw error;
  }

  const peakHourIndex = dna.peakHours.reduce((best, val, idx) => (val > dna.peakHours[best] ? idx : best), 0);
  const peakDayIndex = dna.peakDays.reduce((best, val, idx) => (val > dna.peakDays[best] ? idx : best), 0);
  const anyHourSales = dna.peakHours.some((v) => v > 0);
  const anyDaySales = dna.peakDays.some((v) => v > 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Link href="/admin/vending/intelligence/locations" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Locations
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{location.name}</h1>
          <p className="text-sm text-muted-foreground">
            {location.locationType.replace('_', ' ')} · {location.city} · {dna.machineCount} machine(s)
          </p>
        </div>
        <Badge variant={dna.dataQuality === 'actual' ? 'success' : dna.dataQuality === 'estimated' ? 'warning' : 'secondary'}>
          data quality: {dna.dataQuality}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DetailStat label="Revenue (30d)" value={`KES ${dna.revenueKes.toLocaleString('en-KE')}`} />
        <DetailStat label="Units sold" value={String(dna.unitsSold)} />
        <DetailStat label="Revenue/day" value={`KES ${dna.revenuePerDayKes.toLocaleString('en-KE')}`} />
        <DetailStat label="Units/day" value={String(dna.unitsPerDay)} />
        <DetailStat label="Gross profit" value={`KES ${dna.grossProfitKes.toLocaleString('en-KE')}`} />
        <DetailStat label="Margin" value={dna.marginPct !== null ? `${dna.marginPct}%` : '—'} />
        <DetailStat label="AOV" value={dna.averageOrderValueKes !== null ? `KES ${dna.averageOrderValueKes.toLocaleString('en-KE')}` : '—'} />
        <DetailStat label="Assortment depth" value={String(dna.assortmentDepth)} />
        <DetailStat label="Stockout rate" value={`${dna.stockoutRatePct}%`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Category mix</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.keys(dna.categoryMix).length === 0 ? (
            <p className="text-sm text-muted-foreground">No categorized sales yet.</p>
          ) : (
            Object.entries(dna.categoryMix).map(([category, totals]) => (
              <Badge key={category} variant="secondary">
                {category}: KES {totals.revenueKes.toLocaleString('en-KE')} ({totals.unitsSold} units)
              </Badge>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top products</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {dna.topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              dna.topProducts.map((p) => (
                <div key={p.productId} className="flex items-center justify-between border-b border-border py-1.5 last:border-0 text-sm">
                  <span className="text-foreground">{p.productId}</span>
                  <span className="text-muted-foreground">KES {p.revenueKes.toLocaleString('en-KE')}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Slow products</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {dna.slowProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to show yet.</p>
            ) : (
              dna.slowProducts.map((p) => (
                <div key={p.productId} className="flex items-center justify-between border-b border-border py-1.5 last:border-0 text-sm">
                  <span className="text-foreground">{p.productId}</span>
                  <span className="text-muted-foreground">KES {p.revenueKes.toLocaleString('en-KE')}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {dna.deadStockProductIds.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Dead stock</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {dna.deadStockProductIds.map((id) => (
              <Badge key={id} variant="warning">{id}</Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Timing</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <DetailStat label="Peak hour (UTC)" value={anyHourSales ? HOUR_LABELS[peakHourIndex] : 'insufficient data'} />
          <DetailStat label="Peak day" value={anyDaySales ? DAY_LABELS[peakDayIndex] : 'insufficient data'} />
        </CardContent>
      </Card>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
