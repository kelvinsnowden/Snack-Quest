import Link from 'next/link';
import type { Metadata } from 'next';
import { Banknote, ShoppingCart, Wallet } from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPortalService } from '@/services/ownerPortalService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendStatCard } from '@/components/admin/TrendStatCard';
import { DailySalesBarChart } from '@/components/partner/DailySalesBarChart';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Sales & Revenue' };

const WINDOWS = [7, 30, 90] as const;
type Window = (typeof WINDOWS)[number];

function resolveWindow(raw: string | undefined): Window {
  const parsed = Number(raw);
  return WINDOWS.includes(parsed as Window) ? (parsed as Window) : 30;
}

/** § SALES & REVENUE — fleet-wide (all of this partner's machines), the window-scoped counterpart to the Dashboard's own 30-day-only summary. */
export default async function PartnerSalesPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const session = await requirePartnerSession();
  const windowDays = resolveWindow((await searchParams).window);

  const [dashboard, points, products, activity] = await Promise.all([
    ownerPortalService.getDashboard(session.businessId, session.partnerId, windowDays),
    ownerPortalService.getSalesTrend(session.businessId, session.partnerId, windowDays),
    ownerPortalService.getTopProducts(session.businessId, session.partnerId, windowDays, undefined, 10),
    ownerPortalService.getRecentActivity(session.businessId, session.partnerId, 15),
  ]);
  const { summary } = dashboard;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales & Revenue</h1>
          <p className="text-sm text-muted-foreground">Across all your machines.</p>
        </div>
        <div className="flex gap-1 rounded-md border border-border p-1">
          {WINDOWS.map((days) => (
            <Link
              key={days}
              href={`/partner/sales?window=${days}`}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                days === windowDays ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-border/30',
              )}
            >
              {days}d
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <TrendStatCard
          label="Total Sales"
          value={`KES ${summary.totalSalesKes.toLocaleString('en-KE')}`}
          icon={<Banknote className="size-4" aria-hidden="true" />}
          tone="primary"
          trend={summary.totalSalesTrendPct !== null ? { percent: summary.totalSalesTrendPct, comparisonLabel: `vs previous ${windowDays} days` } : undefined}
        />
        <TrendStatCard
          label="Net Earnings"
          value={`KES ${summary.netEarningsKes.toLocaleString('en-KE')}`}
          icon={<Wallet className="size-4" aria-hidden="true" />}
          tone="secondary"
          trend={summary.netEarningsTrendPct !== null ? { percent: summary.netEarningsTrendPct, comparisonLabel: `vs previous ${windowDays} days` } : undefined}
        />
        <TrendStatCard
          label="Total Vends"
          value={String(summary.totalVends)}
          icon={<ShoppingCart className="size-4" aria-hidden="true" />}
          tone="success"
          trend={summary.totalVendsTrendPct !== null ? { percent: summary.totalVendsTrendPct, comparisonLabel: `vs previous ${windowDays} days` } : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily sales ({windowDays} days)</CardTitle>
        </CardHeader>
        <CardContent>{points.length === 0 ? <p className="text-sm text-muted-foreground">No sales recorded yet.</p> : <DailySalesBarChart points={points} />}</CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Top Selling Products</h2>
        {products.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No sales recorded yet.</p>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              {products.map((product) => (
                <div key={product.productId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-foreground">{product.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {product.unitsSold} units · KES {product.revenueKes.toLocaleString('en-KE')}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Recent Sales</h2>
        {activity.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No sales recorded yet.</p>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              {activity.map((item) => (
                <div key={item.transactionId} className="flex items-center justify-between gap-3 border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-foreground">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.machineCode} · {new Date(item.dispensedAt).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-foreground">KES {item.amountKes.toLocaleString('en-KE')}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
