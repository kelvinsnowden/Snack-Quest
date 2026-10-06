import type { Metadata } from 'next';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { requireWorkspacePage } from '@/lib/auth/requireWorkspacePage';
import { hasPermission } from '@/lib/auth/permissions';
import { combinedIncomeService, INCOME_WINDOWS } from '@/services/combinedIncomeService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Income' };

const WINDOW_LABEL: Record<(typeof INCOME_WINDOWS)[number], string> = { 30: 'Last 30 days', 90: 'Last 90 days', 365: 'Last 12 months' };
const LINE_LINK = { website: '/finance/fulfillment', own_machines: '/admin/vending', owner_machines: '/admin/vending/partners', machine_deals: '/finance/machine-deals' } as const;
const HIDDEN_LABEL = { website: 'Website orders', own_machines: 'Snack Quest’s own machines', owner_machines: 'Income from owners’ machines', machine_deals: 'Machines sold' } as const;

/**
 * Everything Snack Quest earned, across both businesses (§ COMBINED
 * INCOME). Owners' machine sales are their money and are shown apart,
 * never added in. Profit is before overheads and only where a cost is
 * recorded; revenue still waiting for a cost is shown beside it.
 */
export default async function IncomePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const session = await requireWorkspacePage('finance.view');
  const requested = Number((await searchParams).days);
  const days = (INCOME_WINDOWS as readonly number[]).includes(requested) ? requested : 30;
  const income = await combinedIncomeService.forWindow(session.businessId, days, {
    website: true,
    machines: hasPermission(session, 'finance.machine_pnl.view'),
    deals: hasPermission(session, 'machines.deals.view'),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-page-title font-bold tracking-tight text-foreground">Income</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            What Snack Quest earned across the website, its machines and machine sales. Each figure comes from the page that owns it, so they always agree.
          </p>
        </div>
        <nav aria-label="Period" className="flex gap-1 rounded-lg border border-border p-1">
          {INCOME_WINDOWS.map((window) => (
            <Link
              key={window}
              href={`/finance/income?days=${window}`}
              aria-current={window === days ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${window === days ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {WINDOW_LABEL[window as (typeof INCOME_WINDOWS)[number]]}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <span className="text-sm text-muted-foreground">Sales</span>
            <span className="text-2xl font-bold tabular-nums">{formatKes(income.totals.revenueKes)}</span>
            <span className="text-caption text-muted-foreground">Money customers and machine buyers paid Snack Quest</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <span className="text-sm text-muted-foreground">Profit before overheads</span>
            <span className={`text-2xl font-bold tabular-nums ${income.totals.profitKes < 0 ? 'text-danger' : ''}`}>{formatKes(income.totals.profitKes)}</span>
            <span className="text-caption text-muted-foreground">Where costs are recorded. Salaries, rent and other overheads aren’t taken off.</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <span className="text-sm text-muted-foreground">Sales still missing a cost</span>
            <span className={`text-2xl font-bold tabular-nums ${income.totals.revenueWithoutCostKes > 0 ? 'text-warning' : ''}`}>{formatKes(income.totals.revenueWithoutCostKes)}</span>
            <span className="text-caption text-muted-foreground">Not counted as profit until its cost is recorded</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where it came from</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-caption uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 text-right font-medium">Sales</th>
                <th className="px-4 py-2 text-right font-medium">Profit</th>
                <th className="px-4 py-2 text-right font-medium">Missing a cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border align-top">
              {income.lines.map((line) => (
                <tr key={line.key}>
                  <td className="px-4 py-3">
                    <Link href={LINE_LINK[line.key]} className="font-medium text-foreground hover:underline">
                      {line.label}
                    </Link>
                    <span className="mt-0.5 block text-caption text-muted-foreground">{line.profitBasis}</span>
                    {line.notes.map((note) => (
                      <span key={note} className="mt-0.5 block text-caption text-muted-foreground">
                        {note}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{line.revenueKes === null ? <span className="text-muted-foreground">Income only</span> : formatKes(line.revenueKes)}</td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${line.profitKes < 0 ? 'text-danger' : ''}`}>{formatKes(line.profitKes)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${line.revenueWithoutCostKes > 0 ? 'text-warning' : 'text-muted-foreground'}`}>{line.revenueWithoutCostKes > 0 ? formatKes(line.revenueWithoutCostKes) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {income.ownersMachineSalesKes !== null ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Owners’ machines also sold {formatKes(income.ownersMachineSalesKes)} of snacks in this period. That is the owners’ money, paid to them through settlements, and isn’t
            included above.
          </span>
        </p>
      ) : null}
      {income.hiddenLines.length > 0 ? (
        <p className="flex items-start gap-2 text-sm text-warning">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>Not included because your access doesn’t cover it: {income.hiddenLines.map((key) => HIDDEN_LABEL[key]).join(', ')}. The totals leave these out.</span>
        </p>
      ) : null}
      <p className="text-caption text-muted-foreground">
        Buying machines for Snack Quest’s own fleet is an investment, not a cost of the period, so it isn’t taken off here. It’s on Machine deals.
      </p>
    </div>
  );
}
