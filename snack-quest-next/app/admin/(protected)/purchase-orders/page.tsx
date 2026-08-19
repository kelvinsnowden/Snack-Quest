import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardCheck, Plus } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { purchaseOrderRepository } from '@/repositories/purchaseOrderRepository';
import { supplierRepository } from '@/repositories/supplierRepository';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PurchaseOrderStatusBadge } from '@/components/admin/PurchaseOrderStatusBadge';
import { PURCHASE_ORDER_STATUS_LABELS } from '@/lib/purchaseOrders/format';
import { formatDate, formatKes } from '@/lib/orders/format';
import type { PurchaseOrderStatus } from '@/types';

export const metadata: Metadata = { title: 'Purchase orders' };

const STATUS_FILTERS: PurchaseOrderStatus[] = ['draft', 'ordered', 'received', 'cancelled'];

export default async function AdminPurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { status, cursor } = await searchParams;
  const validStatus = STATUS_FILTERS.includes(status as PurchaseOrderStatus) ? (status as PurchaseOrderStatus) : undefined;

  const [{ purchaseOrders, nextCursor }, suppliers] = await Promise.all([
    purchaseOrderRepository.listByBusiness(session.businessId, { status: validStatus, cursor }),
    supplierRepository.listByBusiness(session.businessId),
  ]);
  const supplierNameById = new Map(suppliers.map(({ id, data }) => [id, data.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title font-bold tracking-tight text-foreground">Purchase orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Order stock from a supplier, then receive it into real batches.</p>
        </div>
        <Button asChild>
          <Link href="/admin/purchase-orders/new">
            <Plus className="size-4" aria-hidden="true" />
            New purchase order
          </Link>
        </Button>
      </div>

      <Card className="flex flex-wrap gap-2 p-4">
        <Link
          href="/admin/purchase-orders"
          className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors ${
            !status ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
          }`}
        >
          All
        </Link>
        {STATUS_FILTERS.map((value) => (
          <Link
            key={value}
            href={`/admin/purchase-orders?status=${value}`}
            className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors ${
              status === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
            }`}
          >
            {PURCHASE_ORDER_STATUS_LABELS[value]}
          </Link>
        ))}
      </Card>

      {purchaseOrders.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No purchase orders"
          description={status ? 'No purchase orders match this filter.' : 'Create your first purchase order to start receiving stock.'}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Line items</th>
                  <th className="px-4 py-3 font-medium">Total cost</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3">
                      <Link href={`/admin/purchase-orders/${id}`} className="font-medium text-foreground hover:underline">
                        {supplierNameById.get(data.supplierId) ?? data.supplierId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{data.lineItems.length}</td>
                    <td className="px-4 py-3 font-medium tabular-nums text-foreground">{formatKes(data.totalCostKes)}</td>
                    <td className="px-4 py-3">
                      <PurchaseOrderStatusBadge status={data.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(data.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/admin/purchase-orders?${status ? `status=${status}&` : ''}cursor=${nextCursor}`}>Load more</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
