import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { orderRepository } from '@/repositories/orderRepository';
import { formatDate, formatOrderNumber } from '@/lib/orders/format';
import { orderBoxSummary } from '@/types/checkoutLine';
import {
  BulkOrderCostsForm,
  type CostableOrder,
} from '@/components/admin/BulkOrderCostsForm';

export const metadata: Metadata = { title: 'Fulfilment costs' };

/**
 * Recording what delivered orders cost, after the fact
 * (§ fulfilment records the real cost).
 *
 * The per-order box lives on the warehouse queue, which holds orders
 * that are still being packed or are out for delivery. A delivered
 * order has left that queue — so the moment the job finished was
 * exactly the moment its cost could no longer be entered. This page is
 * the way back, and it takes several orders at once because that is
 * how the spending happens: one Bolt, one shopping trip, five boxes.
 *
 * Delivered orders only. An order still in the warehouse queue has its
 * own cost box there, on the screen of the person holding the
 * receipts, and duplicating it here would invite two people to enter
 * the same figure twice.
 */
export default async function FulfilmentCostsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { cursor } = await searchParams;

  const { orders } = await orderRepository.listByBusiness(session.businessId, {
    status: 'delivered',
    limit: 50,
    cursor,
  });

  const costable: CostableOrder[] = orders.map(({ id, data }) => ({
    id,
    orderRef: data.orderNumber !== undefined ? formatOrderNumber(data.orderNumber) : id.slice(0, 8),
    customerName: data.customer.customerName || 'Guest',
    boxSummary: orderBoxSummary(data.product),
    placed: formatDate(data.createdAt),
    revenueKes: data.pricing.totalKes,
    // Absent means nobody has entered it, which is not the same as
    // zero — see `OrderCosts`.
    recordedCostKes: data.costs ? data.costs.goodsCostKes + data.costs.otherCostKes : null,
  }));

  const missing = costable.filter((order) => order.recordedCostKes === null).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title text-foreground font-bold tracking-tight">
          Fulfilment costs
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          What delivered orders actually cost. Select the ones a spend covers, enter it once, and
          say whether it was the total or the cost of each.
        </p>
        {missing > 0 ? (
          <p className="text-warning mt-2 text-sm font-medium">
            {missing} delivered {missing === 1 ? 'order has' : 'orders have'} no cost recorded yet.
          </p>
        ) : null}
      </div>

      <BulkOrderCostsForm orders={costable} />
    </div>
  );
}
