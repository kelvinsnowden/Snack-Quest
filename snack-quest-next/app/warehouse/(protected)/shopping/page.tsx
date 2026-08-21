import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, ShoppingBasket } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { shoppingRunService } from '@/services/shoppingRunService';
import { orderRepository } from '@/repositories/orderRepository';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { NewShoppingRun } from '@/components/warehouse/NewShoppingRun';
import { formatOrderNumber } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Shopping' };

/**
 * Shopping runs (§ Box Recipes) — start a trip from the confirmed
 * orders waiting to be packed, and pick up one already in progress.
 *
 * The order picker is deliberately here rather than on a separate
 * screen: choosing what to shop for and shopping are one task, and a
 * runner about to leave should not have to navigate to start.
 */
export default async function WarehouseShoppingPage() {
  const session = await requireStaffSession();

  const [{ runs }, { orders }] = await Promise.all([
    shoppingRunService.listRuns(session.businessId, { limit: 20 }),
    orderRepository.listByBusiness(session.businessId, { status: 'confirmed' }),
  ]);

  const openRuns = runs.filter((run) => run.data.status === 'open');
  const doneRuns = runs.filter((run) => run.data.status !== 'open');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Shopping</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One list for every box in a batch of orders, already added up.
        </p>
      </div>

      <NewShoppingRun
        orders={orders.map(({ id, data }) => ({
          id,
          label: data.orderNumber ? formatOrderNumber(data.orderNumber) : id.slice(0, 6),
          packageLabel: data.product.packageLabel,
          customerName: data.customer.customerName,
        }))}
      />

      {openRuns.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">In progress</h2>
          <ul className="flex flex-col gap-2.5">
            {openRuns.map((run) => (
              <li key={run.id}>
                <RunRow
                  id={run.id}
                  orderCount={run.data.orderCount}
                  lineCount={run.data.lines.length}
                  boughtCount={run.data.lines.filter((line) => line.purchased).length}
                  expectedTotalKes={run.data.expectedTotalKes}
                  actualTotalKes={run.data.actualTotalKes}
                  status="open"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {doneRuns.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">Done</h2>
          <ul className="flex flex-col gap-2.5">
            {doneRuns.map((run) => (
              <li key={run.id}>
                <RunRow
                  id={run.id}
                  orderCount={run.data.orderCount}
                  lineCount={run.data.lines.length}
                  boughtCount={run.data.lines.filter((line) => line.purchased).length}
                  expectedTotalKes={run.data.expectedTotalKes}
                  actualTotalKes={run.data.actualTotalKes}
                  status="completed"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {runs.length === 0 ? (
        <EmptyState
          icon={ShoppingBasket}
          title="No shopping runs yet"
          description="Pick the orders you're buying for above, and this builds one combined list from their recipes."
        />
      ) : null}
    </div>
  );
}

function RunRow({
  id,
  orderCount,
  lineCount,
  boughtCount,
  expectedTotalKes,
  actualTotalKes,
  status,
}: {
  id: string;
  orderCount: number;
  lineCount: number;
  boughtCount: number;
  expectedTotalKes: number;
  actualTotalKes: number;
  status: 'open' | 'completed';
}) {
  return (
    <Link
      href={`/warehouse/shopping/${id}`}
      className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition-colors active:bg-border/30"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">
            {orderCount} order{orderCount === 1 ? '' : 's'}
          </span>
          <Badge variant={status === 'open' ? 'warning' : 'success'}>{status === 'open' ? 'shopping' : 'done'}</Badge>
        </div>
        <span className="text-caption text-muted-foreground">
          <span className="tabular-nums">
            {boughtCount}/{lineCount}
          </span>{' '}
          bought · budget KES <span className="tabular-nums">{expectedTotalKes.toLocaleString()}</span>
          {actualTotalKes > 0 ? (
            <>
              {' '}
              · spent KES <span className="tabular-nums">{actualTotalKes.toLocaleString()}</span>
            </>
          ) : null}
        </span>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
