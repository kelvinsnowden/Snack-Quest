import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Banknote, PiggyBank, Receipt } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { fulfillmentAccountingService } from '@/services/fulfillmentAccountingService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatKes } from '@/lib/orders/format';
import { ORDER_STATUS_LABELS } from '@/lib/orders/transitions';

export const metadata: Metadata = { title: 'Fulfilment accounting' };

/**
 * What the shopping trips actually added up to (§ Fulfillment Batches
 * — accounting). Finance's counterpart to `/admin/fulfillment-batches`,
 * which lists individual trips: this is the month-level answer to
 * "what did we keep".
 *
 * The uncosted panel is the point of the page, not a footnote. Gross
 * profit here only covers orders a real shopping trip has been recorded
 * against; every order still waiting for one carries revenue with no
 * cost behind it, and would read as pure profit if it were blended in.
 * Showing coverage alongside the profit is what makes the profit
 * figure worth trusting.
 */
export default async function FinanceFulfillmentPage() {
  const session = await requireStaffSession();
  const overview = await fulfillmentAccountingService.getOverview(session.businessId, 30);

  const coverageIsPartial = overview.costCoveragePct < 99.5;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title text-foreground font-bold tracking-tight">Fulfilment accounting</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The last 30 days of shopping trips — what they cost, and what the orders they covered brought in.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Costed revenue"
          value={formatKes(overview.costed.revenueKes)}
          detail={`${overview.costed.orderCount} order${overview.costed.orderCount === 1 ? '' : 's'}`}
          icon={<Banknote className="size-5" />}
        />
        <StatCard
          label="Cost of goods"
          value={formatKes(overview.costed.costKes)}
          detail={`${overview.batchCount} batch${overview.batchCount === 1 ? '' : 'es'}, avg ${formatKes(overview.averageBatchCostKes)}`}
          icon={<Receipt className="size-5" />}
        />
        <StatCard
          label="Gross profit"
          value={formatKes(overview.costed.grossProfitKes)}
          detail={`${overview.costed.marginPct.toFixed(1)}% margin`}
          icon={<PiggyBank className="size-5" />}
          negative={overview.costed.grossProfitKes < 0}
        />
        <StatCard
          label="Cost coverage"
          value={`${overview.costCoveragePct.toFixed(0)}%`}
          detail={
            coverageIsPartial
              ? `${formatKes(overview.uncosted.revenueKes)} not yet costed`
              : 'Every order is accounted for'
          }
          icon={<AlertTriangle className="size-5" />}
          warning={coverageIsPartial}
        />
      </div>

      {coverageIsPartial ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader>
            <CardTitle>Profit above excludes {overview.uncosted.orderCount} uncosted order{overview.uncosted.orderCount === 1 ? '' : 's'}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              {formatKes(overview.uncosted.revenueKes)} of revenue in this window has no shopping trip recorded
              against it yet. Those orders are not counted as profit here — record the batches that covered them
              and the figures above will complete themselves.
            </p>
            <div>
              <Button asChild size="sm">
                <Link href="/admin/fulfillment-batches/new">Record a batch</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <CardHeader className="p-5">
          <CardTitle>Longest uncosted</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {overview.oldestUncosted.length === 0 ? (
            <p className="text-muted-foreground px-5 pb-5 text-sm">
              Nothing outstanding — every eligible order in this window sits inside a batch.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-border bg-border/20 text-caption text-muted-foreground border-b border-t text-left uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Box</th>
                    <th className="px-4 py-3 font-medium">Revenue</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.oldestUncosted.map((order) => (
                    <tr key={order.id} className="border-border border-b last:border-0 hover:bg-border/20">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="text-foreground font-medium hover:underline"
                        >
                          {order.customerName}
                        </Link>
                      </td>
                      <td className="text-muted-foreground px-4 py-3">{order.packageLabel}</td>
                      <td className="text-foreground px-4 py-3 tabular-nums">{formatKes(order.revenueKes)}</td>
                      <td className="text-muted-foreground px-4 py-3">{ORDER_STATUS_LABELS[order.status]}</td>
                      <td className="text-muted-foreground px-4 py-3 tabular-nums">
                        {order.ageDays === 0 ? 'Today' : `${order.ageDays}d`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon,
  negative,
  warning,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  negative?: boolean;
  warning?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className={warning ? 'text-warning' : 'text-muted-foreground'} aria-hidden="true">
          {icon}
        </span>
      </div>
      <p
        className={`text-2xl font-semibold tabular-nums ${negative ? 'text-danger' : 'text-foreground'}`}
      >
        {value}
      </p>
      <p className="text-muted-foreground text-sm">{detail}</p>
    </Card>
  );
}
