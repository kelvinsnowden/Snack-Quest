import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { fulfillmentBatchService, FulfillmentBatchNotFoundError } from '@/services/fulfillmentBatchService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderStatusBadge } from '@/components/admin/OrderStatusBadge';
import { formatDateTime, formatKes } from '@/lib/orders/format';
import type { FulfillmentBatch, Order } from '@/types';

export const metadata: Metadata = { title: 'Fulfillment batch detail' };

function StatCard({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <p className="text-caption text-muted-foreground uppercase">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${danger ? 'text-danger' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

export default async function AdminFulfillmentBatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const session = await requireStaffSession();
  const { batchId } = await params;

  let batch: FulfillmentBatch;
  let rows: { orderId: string; order: Order }[];
  try {
    const result = await fulfillmentBatchService.getFulfillmentBatchWithOrders(session.businessId, batchId);
    batch = result.batch;
    rows = result.orders.map(({ id, data }) => ({ orderId: id, order: data }));
  } catch (error) {
    if (error instanceof FulfillmentBatchNotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/fulfillment-batches"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Fulfillment batches
        </Link>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">
          {batch.orderCount} order{batch.orderCount === 1 ? '' : 's'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Created {formatDateTime(batch.createdAt)}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Economics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Revenue" value={formatKes(batch.totalRevenueKes)} />
          <StatCard label="Total cost" value={formatKes(batch.costs.totalCostKes)} />
          <StatCard label="Gross profit" value={formatKes(batch.grossProfitKes)} danger={batch.grossProfitKes < 0} />
          <StatCard label="Margin" value={`${batch.profitMarginPct.toFixed(1)}%`} danger={batch.grossProfitKes < 0} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cost breakdown</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Products purchased" value={formatKes(batch.costs.productsPurchasedKes)} />
          <StatCard label="Packaging" value={formatKes(batch.costs.packagingKes)} />
          <StatCard label="Delivery" value={formatKes(batch.costs.deliveryKes)} />
          <StatCard label="Misc" value={formatKes(batch.costs.miscKes)} />
        </CardContent>
      </Card>

      {batch.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">{batch.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Box</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Revenue</th>
                  <th className="px-4 py-3 font-medium">Allocated cost</th>
                  <th className="px-4 py-3 font-medium">Est. profit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ orderId, order }) => (
                  <tr key={orderId} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${orderId}`} className="font-medium text-foreground hover:underline">
                        {order.customer.customerName || 'Guest'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">{order.product.packageLabel}</td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(order.fulfillment?.orderRevenueKes ?? 0)}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(order.fulfillment?.allocatedCostKes ?? 0)}</td>
                    <td
                      className={`px-4 py-3 font-medium tabular-nums ${
                        (order.fulfillment?.estimatedProfitKes ?? 0) < 0 ? 'text-danger' : 'text-foreground'
                      }`}
                    >
                      {formatKes(order.fulfillment?.estimatedProfitKes ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
