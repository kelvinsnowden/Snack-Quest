import type { Metadata } from 'next';
import { Banknote, ClipboardList, Receipt } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { businessAnalyticsService } from '@/services/businessAnalyticsService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RevenueChart } from '@/components/admin/RevenueChart';
import { FunnelChart } from '@/components/admin/FunnelChart';
import { MarketingSpendForm } from '@/components/admin/MarketingSpendForm';
import { TrendStatCard } from '@/components/admin/TrendStatCard';
import { formatKes } from '@/lib/orders/format';
import { computePeriodTrend } from '@/lib/analytics/trend';

export const metadata: Metadata = { title: 'Analytics' };

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default async function AdminAnalyticsPage() {
  const session = await requireStaffSession();
  const month = currentMonth();

  const [revenue, funnel, topCreators, cac, delivery] = await Promise.all([
    businessAnalyticsService.getRevenueOverview(session.businessId, 30),
    businessAnalyticsService.getFunnel(session.businessId),
    businessAnalyticsService.getTopCreators(session.businessId),
    businessAnalyticsService.getCac(session.businessId, month),
    businessAnalyticsService.getDeliveryPerformance(session.businessId),
  ]);

  const previousAverageOrderValueKes =
    revenue.previousPeriod.orderCount > 0
      ? Math.round(revenue.previousPeriod.totalRevenueKes / revenue.previousPeriod.orderCount)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Revenue, conversion, and acquisition, computed from real orders and conversations.</p>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Checkout funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelChart stages={funnel} />
            <p className="mt-4 text-caption text-muted-foreground">Based on the {funnel[0]?.count ?? 0} most recent conversations.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer acquisition cost</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-caption text-muted-foreground uppercase">New customers</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{cac.newCustomers}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground uppercase">CAC</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {cac.cacKes !== null ? formatKes(cac.cacKes) : '—'}
                </p>
              </div>
            </div>
            <p className="text-caption text-muted-foreground">
              There&apos;s no ad-spend integration — enter what {month} actually cost to compute a real CAC.
            </p>
            <MarketingSpendForm month={month} initialAmountKes={cac.spendKes} />
          </CardContent>
        </Card>
      </div>

      {delivery.totalShipments > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Delivery performance</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="text-caption text-muted-foreground uppercase">Shipments</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{delivery.totalShipments}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground uppercase">Delivered</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{delivery.deliveredCount}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground uppercase">Failed</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{delivery.failedCount}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground uppercase">Median delivery time</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {delivery.medianDeliveryHours !== null ? `${delivery.medianDeliveryHours}h` : '—'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {delivery.statusBreakdown.map((status) => (
                <span
                  key={status.status}
                  className="rounded-full border border-border bg-border/20 px-3 py-1 text-xs font-medium text-foreground"
                >
                  {status.label}: {status.count}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {topCreators.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Top creators</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Creator</th>
                    <th className="px-4 py-3 font-medium">Conversions</th>
                    <th className="px-4 py-3 font-medium">Commission earned</th>
                  </tr>
                </thead>
                <tbody>
                  {topCreators.map((creator) => (
                    <tr key={creator.creatorId} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{creator.displayName}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{creator.conversions}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(creator.commissionKes)}</td>
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
