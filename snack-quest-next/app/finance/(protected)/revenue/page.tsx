import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { businessAnalyticsService } from '@/services/businessAnalyticsService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RevenueChart } from '@/components/admin/RevenueChart';
import { formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Revenue' };

/**
 * Finance's revenue view (§ Finance workspace) — the same real
 * `businessAnalyticsService.getRevenueOverview` numbers as Admin:
 * Analytics, narrowed to what finance actually needs (revenue, order
 * count, AOV, the daily trend). Funnel/CAC/top-creators stay on
 * `/admin/analytics` — that's a marketing/growth audience, not finance.
 */
export default async function FinanceRevenuePage() {
  const session = await requireStaffSession();
  const revenue = await businessAnalyticsService.getRevenueOverview(session.businessId, 30);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Revenue</h1>
        <p className="mt-1 text-sm text-muted-foreground">Computed from real, paid orders — the last 30 days.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Revenue (30 days)</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{formatKes(revenue.totalRevenueKes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Orders (30 days)</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{revenue.orderCount.toLocaleString('en-KE')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Average order value</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{formatKes(revenue.averageOrderValueKes)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue, last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueChart days={revenue.days} />
        </CardContent>
      </Card>
    </div>
  );
}
