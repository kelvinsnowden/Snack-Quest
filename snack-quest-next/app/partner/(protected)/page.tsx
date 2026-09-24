import Link from 'next/link';
import type { Metadata } from 'next';
import { Banknote, Boxes, CircleDot, MapPin, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPortalService } from '@/services/ownerPortalService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendStatCard } from '@/components/admin/TrendStatCard';
import { SalesTrendChart } from '@/components/partner/SalesTrendChart';
import { StockLevelBar } from '@/components/partner/StockLevelBar';

export const metadata: Metadata = { title: 'Dashboard' };

const CONNECTIVITY_DOT: Record<string, string> = {
  online: 'text-success',
  stale: 'text-warning',
  offline: 'text-danger',
  unknown: 'text-muted-foreground',
};

const WINDOW_DAYS = 30;

/**
 * § OWNER DASHBOARD. Every figure here reads from `ownerPortalService`
 * — nothing on this page computes its own number. `summary` (stat
 * tiles + trend), `points` (sales trend chart), `products` (top
 * sellers), and `alerts` all come from the same real backend the rest
 * of the Owner Portal already uses, scoped to this partner's own
 * machines throughout.
 */
export default async function PartnerDashboardPage() {
  const session = await requirePartnerSession();
  const [dashboard, points, products, alerts] = await Promise.all([
    ownerPortalService.getDashboard(session.businessId, session.partnerId, WINDOW_DAYS),
    ownerPortalService.getSalesTrend(session.businessId, session.partnerId, WINDOW_DAYS),
    ownerPortalService.getTopProducts(session.businessId, session.partnerId, WINDOW_DAYS, undefined, 5),
    ownerPortalService.getAlerts(session.businessId, session.partnerId),
  ]);
  const { summary } = dashboard;

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:gap-6">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Welcome back, {dashboard.partner.name.split(' ')[0]}</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s how your vending business is performing.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TrendStatCard
            label="Total Sales"
            value={`KES ${summary.totalSalesKes.toLocaleString('en-KE')}`}
            icon={<Banknote className="size-4" aria-hidden="true" />}
            tone="primary"
            trend={summary.totalSalesTrendPct !== null ? { percent: summary.totalSalesTrendPct, comparisonLabel: 'vs previous 30 days' } : undefined}
          />
          <TrendStatCard
            label="Net Earnings"
            value={`KES ${summary.netEarningsKes.toLocaleString('en-KE')}`}
            icon={<Wallet className="size-4" aria-hidden="true" />}
            tone="secondary"
            trend={summary.netEarningsTrendPct !== null ? { percent: summary.netEarningsTrendPct, comparisonLabel: 'vs previous 30 days' } : undefined}
          />
          <TrendStatCard
            label="Total Vends"
            value={String(summary.totalVends)}
            icon={<ShoppingCart className="size-4" aria-hidden="true" />}
            tone="success"
            trend={summary.totalVendsTrendPct !== null ? { percent: summary.totalVendsTrendPct, comparisonLabel: 'vs previous 30 days' } : undefined}
          />
          <TrendStatCard label="Active Machines" value={`${summary.activeMachineCount} / ${summary.totalMachineCount}`} icon={<Boxes className="size-4" aria-hidden="true" />} tone="warning" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4" aria-hidden="true" />
              Sales Trend
            </CardTitle>
          </CardHeader>
          <CardContent>{points.length === 0 ? <p className="text-sm text-muted-foreground">No sales recorded yet.</p> : <SalesTrendChart points={points} />}</CardContent>
        </Card>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Top Selling Products</h2>
            <Link href="/partner/sales" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
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
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Your Machines</h2>
            <Link href="/partner/machines" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          {dashboard.machines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No machines yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {dashboard.machines.map((machine) => {
                const stockPct = machine.stockHealth.assortmentCount > 0 ? (machine.stockHealth.sellableCount / machine.stockHealth.assortmentCount) * 100 : 100;
                return (
                  <Link key={machine.machineId} href={`/partner/machines/${machine.machineId}`} className="block">
                    <Card className="transition-colors hover:bg-border/10">
                      <CardContent className="flex flex-col gap-3 p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">{machine.machineCode}</span>
                          <span className={`flex items-center gap-1.5 text-xs font-medium capitalize ${CONNECTIVITY_DOT[machine.connectivity]}`}>
                            <CircleDot className="size-3" aria-hidden="true" />
                            {machine.connectivity}
                          </span>
                        </div>
                        {machine.locationName ? (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="size-3.5" aria-hidden="true" />
                            {machine.locationName}
                          </span>
                        ) : null}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Revenue (30d)</p>
                            <p className="font-semibold text-foreground">KES {machine.revenueKes.toLocaleString('en-KE')}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Units sold</p>
                            <p className="font-semibold text-foreground">{machine.unitsSold}</p>
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                            <span>Stock level</span>
                            <span>{Math.round(stockPct)}%</span>
                          </div>
                          <StockLevelBar percent={stockPct} />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alerts &amp; Notifications</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing needs your attention right now.</p>
            ) : (
              alerts.slice(0, 6).map((alert) => (
                <div key={alert.id} className="flex flex-col gap-0.5 border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'secondary'}>{alert.title}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {alert.machineCode ?? 'Fleet-wide'} · {alert.detail}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {summary.activeMachineCount < summary.totalMachineCount ? (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="flex flex-col gap-2 p-4">
              <p className="text-sm font-semibold text-foreground">Keep your machines running</p>
              <p className="text-sm text-muted-foreground">
                {summary.totalMachineCount - summary.activeMachineCount} machine{summary.totalMachineCount - summary.activeMachineCount === 1 ? '' : 's'} not currently active.
              </p>
              <Link href="/partner/machines" className="text-sm font-medium text-primary hover:underline">
                View machines →
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
