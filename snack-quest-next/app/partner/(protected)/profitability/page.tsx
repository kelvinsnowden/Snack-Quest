import Link from 'next/link';
import type { Metadata } from 'next';
import { Banknote, Coins, Percent, ShoppingCart } from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerProfitabilityService } from '@/services/ownerProfitabilityService';
import { PERIOD_PRESETS, PERIOD_PRESET_LABEL, resolvePeriod } from '@/lib/finance/periods';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendStatCard } from '@/components/admin/TrendStatCard';
import { DailySalesBarChart } from '@/components/partner/DailySalesBarChart';

export const metadata: Metadata = { title: 'Profit' };

const kes = (value: number) => `KES ${Math.round(value).toLocaleString('en-KE')}`;
const pct = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)}%`);
const trend = (current: number, previous: number, label: string) => (previous > 0 ? { percent: Math.round(((current - previous) / previous) * 1000) / 10, comparisonLabel: label } : undefined);
const dateTime = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

type Search = { preset?: string; from?: string; to?: string; machineId?: string; category?: string };

/**
 * § OWNER PROFITABILITY — how the owner's machines make money: what they
 * sold, what the stock cost them, and what they kept. "Your cost" is what the
 * owner pays for a unit under their agreement; Snack Quest's own cost is
 * never shown here.
 */
export default async function PartnerProfitabilityPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePartnerSession();
  const search = await searchParams;
  const period = resolvePeriod({ preset: search.preset, from: search.from, to: search.to });
  const report = await ownerProfitabilityService.report(session.businessId, session.partnerId, period, { machineId: search.machineId ?? null, category: search.category ?? null });
  const { totals, previous } = report;
  const query = (patch: Partial<Search>) => {
    const next = new URLSearchParams();
    const merged = { preset: period.preset, from: period.fromKey, to: period.toKey, machineId: search.machineId, category: search.category, ...patch };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    return `/partner/profitability?${next.toString()}`;
  };
  const comparison = `vs the ${period.days} day${period.days === 1 ? '' : 's'} before`;
  const bestProducts = report.byProduct.slice(0, 5);
  const worstProducts = [...report.byProduct].sort((a, b) => (a.grossMarginPct ?? Infinity) - (b.grossMarginPct ?? Infinity)).slice(0, 5);
  const busiestHour = report.byHour.reduce((best, hour) => (hour.revenueKes > best.revenueKes ? hour : best), report.byHour[0]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Profit</h1>
          <p className="text-sm text-muted-foreground">
            {report.period.from === report.period.to ? report.period.from : `${report.period.from} to ${report.period.to}`} · what you sold, what it cost you, and what you kept.
          </p>
        </div>
        <nav aria-label="Period" className="flex flex-wrap gap-1 rounded-md border border-border p-1">
          {PERIOD_PRESETS.filter((preset) => preset !== 'custom').map((preset) => (
            <Button key={preset} asChild variant={preset === period.preset ? 'primary' : 'ghost'} size="sm">
              <Link href={query({ preset, from: undefined, to: undefined })}>{PERIOD_PRESET_LABEL[preset]}</Link>
            </Button>
          ))}
        </nav>
        <form className="flex flex-wrap items-end gap-2 text-sm" action="/partner/profitability">
          <input type="hidden" name="preset" value="custom" />
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted-foreground">From</span>
            <input type="date" name="from" defaultValue={period.fromKey} className="min-h-10 rounded-md border border-border bg-surface px-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted-foreground">To</span>
            <input type="date" name="to" defaultValue={period.toKey} className="min-h-10 rounded-md border border-border bg-surface px-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted-foreground">Machine</span>
            <select name="machineId" defaultValue={search.machineId ?? ''} className="min-h-10 rounded-md border border-border bg-surface px-2">
              <option value="">All machines</option>
              {report.filterOptions.machines.map((machine) => (
                <option key={machine.id} value={machine.id}>{machine.code}</option>
              ))}
            </select>
          </label>
          {report.filterOptions.categories.length > 0 ? (
            <label className="flex flex-col gap-1">
              <span className="text-caption text-muted-foreground">Category</span>
              <select name="category" defaultValue={search.category ?? ''} className="min-h-10 rounded-md border border-border bg-surface px-2">
                <option value="">All categories</option>
                {report.filterOptions.categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
          ) : null}
          <Button type="submit" size="sm" className="min-h-10">Show</Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TrendStatCard label="Sales" value={kes(totals.netRevenueKes)} icon={<Banknote className="size-4" aria-hidden="true" />} tone="primary" trend={trend(totals.netRevenueKes, previous.netRevenueKes, comparison)} />
        <TrendStatCard label="Gross profit" value={kes(totals.grossProfitKes)} icon={<Coins className="size-4" aria-hidden="true" />} tone="success" trend={trend(totals.grossProfitKes, previous.grossProfitKes, comparison)} />
        <TrendStatCard label="Gross margin" value={pct(totals.grossMarginPct)} icon={<Percent className="size-4" aria-hidden="true" />} tone="secondary" />
        <TrendStatCard label="Units sold" value={totals.units.toLocaleString('en-KE')} icon={<ShoppingCart className="size-4" aria-hidden="true" />} tone="secondary" trend={trend(totals.units, previous.units, comparison)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How the money adds up</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm tabular-nums">
            <dt className="text-muted-foreground">Sales</dt>
            <dd className="text-right">{kes(totals.grossRevenueKes)}</dd>
            <dt className="text-muted-foreground">Your cost of what sold</dt>
            <dd className="text-right">− {kes(totals.cogsKes)}</dd>
            <dt className="font-medium text-foreground">Gross profit</dt>
            <dd className="text-right font-medium">{kes(totals.grossProfitKes)}</dd>
            <dt className="text-muted-foreground">Subscription (as settled)</dt>
            <dd className="text-right">− {kes(totals.subscriptionKes)}</dd>
            <dt className="font-semibold text-foreground">What you kept</dt>
            <dd className="text-right font-semibold">{kes(totals.contributionKes)}</dd>
            <dt className="text-muted-foreground">Average sale</dt>
            <dd className="text-right">{totals.averageTransactionKes === null ? '—' : kes(totals.averageTransactionKes)}</dd>
            <dt className="text-muted-foreground">Refunded to customers</dt>
            <dd className="text-right">{report.refundedToCustomers.count} · {kes(report.refundedToCustomers.amountKes)}</dd>
          </dl>
          <ul className="mt-4 flex flex-col gap-1 text-caption text-muted-foreground">
            <li>Refunds are for sales where the product didn’t come out; they were never counted as sales.</li>
            {report.notes.unpricedUnits > 0 ? <li>{report.notes.unpricedUnits} unit(s) have no recorded cost yet, so they are left out of profit and margin.</li> : null}
            {report.notes.estimatedCostUnits > 0 ? <li>{report.notes.estimatedCostUnits} older sale(s) are costed at today’s price because they were made before costs were recorded per sale.</li> : null}
            {report.notes.missingCosts.includes('payment_fees') ? <li>M-Pesa charges aren’t included yet.</li> : null}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales by day</CardTitle>
          </CardHeader>
          <CardContent>
            <DailySalesBarChart points={report.byDay.map((day) => ({ date: day.date, revenueKes: day.revenueKes, unitsSold: day.units }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales by hour</CardTitle>
            <p className="text-sm text-muted-foreground">{busiestHour.revenueKes > 0 ? `Busiest: ${String(busiestHour.hour).padStart(2, '0')}:00–${String((busiestHour.hour + 1) % 24).padStart(2, '0')}:00` : 'No sales in this period.'}</p>
          </CardHeader>
          <CardContent>
            <ol className="grid grid-cols-12 items-end gap-1" aria-label="Revenue by hour of day">
              {report.byHour.map((hour) => {
                const max = Math.max(1, ...report.byHour.map((entry) => entry.revenueKes));
                return (
                  <li key={hour.hour} className="flex flex-col items-center gap-1" title={`${String(hour.hour).padStart(2, '0')}:00 · ${kes(hour.revenueKes)} · ${hour.units} units`}>
                    <span className="w-full rounded-sm bg-primary/70" style={{ height: `${Math.max(2, Math.round((hour.revenueKes / max) * 80))}px` }} />
                    <span className="text-[10px] tabular-nums text-muted-foreground">{hour.hour % 3 === 0 ? hour.hour : ''}</span>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Best sellers</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ProductTable rows={bestProducts} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lowest margins</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ProductTable rows={worstProducts} />
          </CardContent>
        </Card>
      </div>

      {report.byMachine.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Machines compared</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-caption uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Machine</th>
                  <th className="px-4 py-2 text-right">Sales</th>
                  <th className="px-4 py-2 text-right">Gross profit</th>
                  <th className="px-4 py-2 text-right">Margin</th>
                  <th className="px-4 py-2 text-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {report.byMachine.map((machine) => (
                  <tr key={machine.machineId} className="border-b border-border last:border-0 tabular-nums">
                    <td className="px-4 py-2 font-medium">{machine.machineCode}</td>
                    <td className="px-4 py-2 text-right">{kes(machine.revenueKes)}</td>
                    <td className="px-4 py-2 text-right">{kes(machine.grossProfitKes)}</td>
                    <td className="px-4 py-2 text-right">{pct(machine.grossMarginPct)}</td>
                    <td className="px-4 py-2 text-right">{machine.units}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Every sale</CardTitle>
          <p className="text-sm text-muted-foreground">Newest first{report.sales.length === 200 ? ' (latest 200)' : ''}.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-caption uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2">Machine</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">Your cost</th>
                <th className="px-4 py-2 text-right">Profit</th>
                <th className="px-4 py-2 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {report.sales.map((sale) => (
                <tr key={sale.id} className="border-b border-border last:border-0 tabular-nums">
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{sale.dispensedAt ? dateTime.format(new Date(sale.dispensedAt)) : '—'}</td>
                  <td className="px-4 py-2">{sale.productName}</td>
                  <td className="px-4 py-2">{sale.machineCode}</td>
                  <td className="px-4 py-2 text-right">{kes(sale.sellingPriceKes)}</td>
                  <td className="px-4 py-2 text-right">{sale.yourCostKes === null ? 'not set' : `${kes(sale.yourCostKes)}${sale.costEstimated ? '*' : ''}`}</td>
                  <td className="px-4 py-2 text-right">{sale.grossProfitKes === null ? '—' : kes(sale.grossProfitKes)}</td>
                  <td className="px-4 py-2 text-right">{pct(sale.grossMarginPct)}</td>
                </tr>
              ))}
              {report.sales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No sales in this period.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {report.sales.some((sale) => sale.costEstimated) ? <p className="px-4 py-2 text-caption text-muted-foreground">* costed at today’s price (sold before costs were recorded per sale).</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ProductTable({ rows }: { rows: { productId: string; productName: string; units: number; revenueKes: number; grossProfitKes: number; grossMarginPct: number | null }[] }) {
  if (rows.length === 0) return <p className="px-6 pb-6 text-sm text-muted-foreground">No sales in this period.</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.productId} className="border-t border-border tabular-nums">
            <td className="px-4 py-2">{row.productName}</td>
            <td className="px-4 py-2 text-right text-muted-foreground">{row.units} sold</td>
            <td className="px-4 py-2 text-right">{kes(row.grossProfitKes)}</td>
            <td className="px-4 py-2 text-right">{pct(row.grossMarginPct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
