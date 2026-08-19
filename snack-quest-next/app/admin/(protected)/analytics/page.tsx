import type { Metadata } from 'next';
import Link from 'next/link';
import { Banknote, ClipboardList, Receipt, Users, Eye, RotateCcw, Repeat, Wallet } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { businessAnalyticsService, ORDER_CHANNEL_LABELS } from '@/services/businessAnalyticsService';
import { fulfillmentAccountingService } from '@/services/fulfillmentAccountingService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RevenueChart } from '@/components/admin/RevenueChart';
import { FunnelChart } from '@/components/admin/FunnelChart';
import { TrafficChart } from '@/components/admin/TrafficChart';
import { MarketingSpendForm } from '@/components/admin/MarketingSpendForm';
import { TrendStatCard } from '@/components/admin/TrendStatCard';
import { formatKes } from '@/lib/orders/format';
import { computePeriodTrend } from '@/lib/analytics/trend';
import { resolveTrafficRange, type TrafficRangeKey } from '@/lib/analytics/trafficRange';

export const metadata: Metadata = { title: 'Analytics' };

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

const TRAFFIC_RANGE_PRESETS: { key: TrafficRangeKey; label: string; query: string }[] = [
  { key: 'day', label: 'Today', query: '?range=day' },
  { key: 'week', label: 'Last 7 days', query: '?range=week' },
  { key: 'month', label: 'Last 30 days', query: '' },
];

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const session = await requireStaffSession();
  const month = currentMonth();
  const trafficParams = await searchParams;
  const trafficRange = resolveTrafficRange(trafficParams);

  const [
    revenue,
    funnel,
    creatorRoi,
    cac,
    cacByChannel,
    delivery,
    traffic,
    revenueByChannel,
    margin,
    refundRate,
    repeatPurchase,
    abandonment,
    ltv,
  ] = await Promise.all([
    businessAnalyticsService.getRevenueOverview(session.businessId, 30),
    businessAnalyticsService.getFunnel(session.businessId),
    businessAnalyticsService.getCreatorRoi(session.businessId, 30),
    businessAnalyticsService.getCac(session.businessId, month),
    businessAnalyticsService.getCacByChannel(session.businessId, month),
    businessAnalyticsService.getDeliveryPerformance(session.businessId),
    businessAnalyticsService.getTrafficForRange(session.businessId, {
      start: trafficRange.start,
      end: trafficRange.end,
    }),
    businessAnalyticsService.getRevenueByChannel(session.businessId, 30),
    fulfillmentAccountingService.getOverview(session.businessId, 30),
    businessAnalyticsService.getRefundRate(session.businessId, 30),
    businessAnalyticsService.getRepeatPurchaseRate(session.businessId, 30),
    businessAnalyticsService.getCheckoutAbandonment(session.businessId, 30),
    businessAnalyticsService.getLtv(session.businessId),
  ]);

  const previousAverageOrderValueKes =
    revenue.previousPeriod.orderCount > 0
      ? Math.round(revenue.previousPeriod.totalRevenueKes / revenue.previousPeriod.orderCount)
      : 0;

  const metaCac = cacByChannel.find((c) => c.channel === 'meta');
  const tiktokCac = cacByChannel.find((c) => c.channel === 'tiktok');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Analytics</h1>
        <p className="hidden sm:block mt-1 text-sm text-muted-foreground">Revenue, conversion, and acquisition, computed from real orders and conversations.</p>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue, last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart days={revenue.days} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by channel</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {revenueByChannel.channels.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-sm">
                  <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-3 font-medium">Channel</th>
                      <th className="px-4 py-3 font-medium">Orders</th>
                      <th className="px-4 py-3 font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueByChannel.channels.map((c) => (
                      <tr key={c.channel} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium text-foreground">{ORDER_CHANNEL_LABELS[c.channel]}</td>
                        <td className="px-4 py-3 tabular-nums text-foreground">{c.orderCount}</td>
                        <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(c.revenueKes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">No revenue in the last 30 days yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Margin</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Real cost from recorded shopping trips, not a guess — see{' '}
          <a href="/finance/fulfillment" className="text-primary hover:underline">
            Finance → Fulfillment
          </a>{' '}
          for the full ledger.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-caption text-muted-foreground uppercase">Costed revenue</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatKes(margin.costed.revenueKes)}</p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground uppercase">Gross profit</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatKes(margin.costed.grossProfitKes)}</p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground uppercase">Margin</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{margin.costed.marginPct.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground uppercase">Cost coverage</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{margin.costCoveragePct.toFixed(0)}%</p>
            </div>
          </div>
          {margin.uncosted.orderCount > 0 ? (
            <p className="text-caption text-muted-foreground">
              {margin.uncosted.orderCount} order{margin.uncosted.orderCount === 1 ? '' : 's'} worth{' '}
              {formatKes(margin.uncosted.revenueKes)} in this window have no shopping trip recorded against them yet
              — their margin isn&apos;t counted above until one is.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Website traffic</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Real visits to the public site, tracked by a first-party beacon — not a third-party service.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {TRAFFIC_RANGE_PRESETS.map((preset) => (
            <Link
              key={preset.key}
              href={`/admin/analytics${preset.query}`}
              className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors ${
                trafficRange.key === preset.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-border/40'
              }`}
            >
              {preset.label}
            </Link>
          ))}
        </div>

        <form
          action="/admin/analytics"
          method="GET"
          className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="range" value="custom" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={trafficRange.key === 'custom' ? trafficParams.from : undefined}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              name="to"
              type="date"
              defaultValue={trafficRange.key === 'custom' ? trafficParams.to : undefined}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <Button type="submit" variant={trafficRange.key === 'custom' ? 'primary' : 'outline'}>
            Apply custom range
          </Button>
        </form>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <TrendStatCard
          label={`Visitors (${trafficRange.label})`}
          value={traffic.uniqueVisitors.toLocaleString('en-KE')}
          icon={<Users className="size-5" />}
          tone="secondary"
          trend={computePeriodTrend(traffic.uniqueVisitors, traffic.previousPeriod.uniqueVisitors, 'vs previous period')}
          sparkline={traffic.days.map((d) => d.uniqueVisitors)}
        />
        <TrendStatCard
          label={`Page views (${trafficRange.label})`}
          value={traffic.totalVisits.toLocaleString('en-KE')}
          icon={<Eye className="size-5" />}
          trend={computePeriodTrend(traffic.totalVisits, traffic.previousPeriod.totalVisits, 'vs previous period')}
          sparkline={traffic.days.map((d) => d.visits)}
        />
      </div>

      {traffic.totalVisits > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Visits, {trafficRange.label.toLowerCase()}</CardTitle>
            </CardHeader>
            <CardContent>
              <TrafficChart days={traffic.days} />
              <div className="mt-3 flex items-center gap-4 text-caption text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
                  Page views
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2 rounded-full bg-secondary" />
                  Visitors
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top pages</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-sm">
                  <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-3 font-medium">Page</th>
                      <th className="px-4 py-3 font-medium">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traffic.topPages.map((page) => (
                      <tr key={page.path} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium text-foreground">{page.path}</td>
                        <td className="px-4 py-3 tabular-nums text-foreground">{page.visits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No visits recorded yet — this fills in as people browse the site.
          </CardContent>
        </Card>
      )}

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
            <CardTitle>Checkout abandonment (30 days)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-caption text-muted-foreground uppercase">STK pushes sent</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{abandonment.totalIntents}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground uppercase">Completed</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{abandonment.succeededIntents}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground uppercase">Abandoned</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{abandonment.abandonmentRatePct.toFixed(0)}%</p>
              </div>
            </div>
            <p className="text-caption text-muted-foreground">
              A customer who received the M-Pesa prompt but never completed it — the number a fix like naming the
              M-Pesa recipient on checkout is meant to move.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
                <p className="text-caption text-muted-foreground uppercase">Blended CAC</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {cac.cacKes !== null ? formatKes(cac.cacKes) : '—'}
                </p>
              </div>
            </div>
            {metaCac || tiktokCac ? (
              <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                <div>
                  <p className="text-caption text-muted-foreground uppercase">Meta CAC</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {metaCac?.cacKes !== null && metaCac?.cacKes !== undefined ? formatKes(metaCac.cacKes) : '—'}
                  </p>
                  <p className="text-caption text-muted-foreground">{metaCac?.newCustomers ?? 0} new customers</p>
                </div>
                <div>
                  <p className="text-caption text-muted-foreground uppercase">TikTok CAC</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {tiktokCac?.cacKes !== null && tiktokCac?.cacKes !== undefined ? formatKes(tiktokCac.cacKes) : '—'}
                  </p>
                  <p className="text-caption text-muted-foreground">{tiktokCac?.newCustomers ?? 0} new customers</p>
                </div>
              </div>
            ) : null}
            <p className="text-caption text-muted-foreground">
              There&apos;s no ad-spend integration — enter what {month} actually cost to compute a real CAC, per
              platform if you want the split below.
            </p>
            <MarketingSpendForm
              month={month}
              initialAmountKes={cac.spendKes}
              initialMetaSpendKes={metaCac?.spendKes}
              initialTiktokSpendKes={tiktokCac?.spendKes}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Refunds (30 days)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-caption text-muted-foreground uppercase">Refunded orders</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{refundRate.refundedOrderCount}</p>
              </div>
              <div>
                <p className="text-caption text-muted-foreground uppercase">Refund rate</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{refundRate.refundRatePct.toFixed(1)}%</p>
              </div>
            </div>
            <p className="text-caption text-muted-foreground">
              {formatKes(refundRate.refundedAmountKes)} refunded out of {formatKes(refundRate.revenueKes)} taken across{' '}
              {refundRate.orderCount} paid orders.
            </p>
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

      {creatorRoi.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Creator program ROI</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Creator</th>
                    <th className="px-4 py-3 font-medium">Orders</th>
                    <th className="px-4 py-3 font-medium">Revenue driven</th>
                    <th className="px-4 py-3 font-medium">Commission paid</th>
                    <th className="px-4 py-3 font-medium">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {creatorRoi.map((creator) => (
                    <tr key={creator.creatorId} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{creator.displayName}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{creator.orderCount}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(creator.revenueKes)}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(creator.commissionKes)}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{creator.roi !== null ? `${creator.roi}×` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Customers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Real revenue per customer to date — not a predictive model, just what&apos;s actually happened so far.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <TrendStatCard
          label="Avg. revenue per customer"
          value={formatKes(ltv.averageRevenueKes)}
          icon={<Wallet className="size-5" />}
          tone="success"
        />
        <TrendStatCard
          label="Repeat purchase rate (30 days)"
          value={`${repeatPurchase.repeatRatePct.toFixed(0)}%`}
          icon={<Repeat className="size-5" />}
          tone="secondary"
        />
        <TrendStatCard
          label="Refund rate (30 days)"
          value={`${refundRate.refundRatePct.toFixed(1)}%`}
          icon={<RotateCcw className="size-5" />}
          tone="warning"
        />
      </div>
    </div>
  );
}
