import type { Metadata } from 'next';
import { Banknote, ClipboardList, Receipt } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { businessAnalyticsService } from '@/services/businessAnalyticsService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RevenueChart } from '@/components/admin/RevenueChart';
import { TrendStatCard } from '@/components/admin/TrendStatCard';
import { formatKes } from '@/lib/orders/format';
import { computePeriodTrend } from '@/lib/analytics/trend';

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

  const previousAverageOrderValueKes =
    revenue.previousPeriod.orderCount > 0
      ? Math.round(revenue.previousPeriod.totalRevenueKes / revenue.previousPeriod.orderCount)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Revenue</h1>
        <p className="mt-1 text-sm text-muted-foreground">Computed from real, paid orders — the last 30 days.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <TrendStatCard
          label="Revenue (30 days)"
          value={formatKes(revenue.totalRevenueKes)}
          icon={<Banknote className="size-5" />}
          trend={computePeriodTrend(revenue.totalRevenueKes, revenue.previousPeriod.totalRevenueKes, 'vs previous 30 days')}
          sparkline={revenue.days.map((d) => d.revenueKes)}
        />
        <TrendStatCard
          label="Orders (30 days)"
          value={revenue.orderCount.toLocaleString('en-KE')}
          icon={<ClipboardList className="size-5" />}
          trend={computePeriodTrend(revenue.orderCount, revenue.previousPeriod.orderCount, 'vs previous 30 days')}
        />
        <TrendStatCard
          label="Average order value"
          value={formatKes(revenue.averageOrderValueKes)}
          icon={<Receipt className="size-5" />}
          trend={computePeriodTrend(revenue.averageOrderValueKes, previousAverageOrderValueKes, 'vs previous 30 days')}
        />
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
