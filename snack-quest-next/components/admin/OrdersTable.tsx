'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PackagePlus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { OrderStatusBadge } from '@/components/admin/OrderStatusBadge';
import { MobileRecordCard, MobileRecordList } from '@/components/admin/MobileRecordCard';
import { formatKes, formatOrderNumber } from '@/lib/orders/format';
import { isOrderBatchable } from '@/lib/fulfillmentBatches/eligibility';
import type { OrderStatus } from '@/types';

/**
 * A plain-serializable projection of `Order` — Client Components can't
 * receive a raw Firestore document as a prop (its `Timestamp` fields
 * are class instances, not plain objects, and the RSC boundary rejects
 * them), so the Server Component page maps to this shape first, the
 * same reason `lib/orders/format.ts` has `toIsoString()`.
 */
export interface OrderTableRow {
  id: string;
  orderNumber: number | null;
  customerName: string;
  phoneNumber: string;
  packageLabel: string;
  totalKes: number;
  status: OrderStatus;
  fulfillmentBatchId: string | null;
  createdAtLabel: string;
}

export function OrdersTable({ orders }: { orders: OrderTableRow[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const batchableOrders = useMemo(
    () => orders.filter((order) => isOrderBatchable(order.status, order.fulfillmentBatchId)),
    [orders],
  );
  const batchableIds = useMemo(() => batchableOrders.map(({ id }) => id), [batchableOrders]);
  const selectedCount = selectedIds.size;
  const allSelected = batchableIds.length > 0 && selectedCount === batchableIds.length;

  function toggleOne(orderId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(orderId);
      } else {
        next.delete(orderId);
      }
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(batchableIds) : new Set());
  }

  function createBatch() {
    const params = new URLSearchParams({ orderIds: Array.from(selectedIds).join(',') });
    router.push(`/admin/fulfillment-batches/new?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        The bulk-action bar stacks on a phone. Side by side, "Create
        fulfillment batch" and the selected-count were fighting for a
        390px row and the button label wrapped mid-phrase.
      */}
      {selectedCount > 0 ? (
        <div className="border-primary/20 bg-primary/5 sticky top-4 z-10 flex flex-col gap-3 rounded-lg border px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-foreground text-sm font-medium">
            {selectedCount} order{selectedCount === 1 ? '' : 's'} selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
            <Button size="sm" onClick={createBatch} className="flex-1 sm:flex-none">
              <PackagePlus className="size-4" aria-hidden="true" />
              Create fulfillment batch
            </Button>
          </div>
        </div>
      ) : null}

      {/*
        The phone's view of the same rows. The table below is 900px
        wide inside a horizontal scroller, which on a 390px screen puts
        status and total — the two columns anyone opens this page for —
        off the right edge (§ Admin mobile UX overhaul). Same data, same
        selection behaviour, laid out to be read down instead of across.
      */}
      <MobileRecordList>
        {orders.map((order) => {
          const batchable = isOrderBatchable(order.status, order.fulfillmentBatchId);
          const selected = selectedIds.has(order.id);
          return (
            <MobileRecordCard
              key={order.id}
              className={selected ? 'border-primary bg-primary/5' : undefined}
              href={`/admin/orders/${order.id}`}
              title={order.customerName || 'Guest'}
              subtitle={<span className="tabular-nums">{order.phoneNumber}</span>}
              badge={<OrderStatusBadge status={order.status} />}
              leading={
                <Checkbox
                  checked={selected}
                  disabled={!batchable}
                  onCheckedChange={(checked) => toggleOne(order.id, checked === true)}
                  aria-label={`Select order for ${order.customerName || 'guest'}`}
                  // The box stays 20px to look right next to the name;
                  // the invisible inset grows what a thumb can actually
                  // hit to 44px. Padding on a wrapper would not do this
                  // — the tap has to land on the control itself.
                  className="relative before:absolute before:-inset-3 before:content-['']"
                />
              }
              fields={[
                {
                  label: 'Order',
                  value: (
                    <span className="font-mono">
                      {order.orderNumber !== null ? formatOrderNumber(order.orderNumber) : '—'}
                    </span>
                  ),
                },
                { label: 'Total', value: <span className="font-medium tabular-nums">{formatKes(order.totalKes)}</span> },
                { label: 'Box', value: order.packageLabel },
                { label: 'Placed', value: <span className="tabular-nums">{order.createdAtLabel}</span> },
              ]}
              footer={
                order.fulfillmentBatchId ? (
                  <Link
                    href={`/admin/fulfillment-batches/${order.fulfillmentBatchId}`}
                    className="text-primary text-sm font-medium hover:underline"
                  >
                    In a fulfillment batch →
                  </Link>
                ) : null
              }
            />
          );
        })}
      </MobileRecordList>

      <Card className="hidden overflow-hidden p-0 md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
              <tr>
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    checked={allSelected ? true : selectedCount > 0 ? 'indeterminate' : false}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                    disabled={batchableIds.length === 0}
                    aria-label="Select all eligible orders"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Box</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Fulfillment</th>
                <th className="px-4 py-3 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const batchable = isOrderBatchable(order.status, order.fulfillmentBatchId);
                const selected = selectedIds.has(order.id);
                return (
                  <tr key={order.id} className={`border-b border-border last:border-0 hover:bg-border/20 ${selected ? 'bg-primary/5' : ''}`}>
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selected}
                        disabled={!batchable}
                        onCheckedChange={(checked) => toggleOne(order.id, checked === true)}
                        aria-label={`Select order for ${order.customerName || 'guest'}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${order.id}`} className="font-mono text-caption font-medium text-foreground hover:underline">
                        {order.orderNumber !== null ? formatOrderNumber(order.orderNumber) : '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${order.id}`} className="block">
                        <span className="font-medium text-foreground">{order.customerName || 'Guest'}</span>
                        <span className="block text-caption text-muted-foreground tabular-nums">{order.phoneNumber}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">{order.packageLabel}</td>
                    <td className="px-4 py-3 font-medium tabular-nums text-foreground">{formatKes(order.totalKes)}</td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3">
                      {order.fulfillmentBatchId ? (
                        <Link
                          href={`/admin/fulfillment-batches/${order.fulfillmentBatchId}`}
                          className="text-caption text-primary hover:underline"
                        >
                          Batched
                        </Link>
                      ) : (
                        <span className="text-caption text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{order.createdAtLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
