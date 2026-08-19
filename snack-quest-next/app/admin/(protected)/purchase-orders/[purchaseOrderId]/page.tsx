import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { purchaseOrderRepository } from '@/repositories/purchaseOrderRepository';
import { supplierRepository } from '@/repositories/supplierRepository';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PurchaseOrderStatusBadge } from '@/components/admin/PurchaseOrderStatusBadge';
import { PurchaseOrderActions } from '@/components/admin/PurchaseOrderActions';
import { formatDateTime, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Purchase order detail' };

export default async function AdminPurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ purchaseOrderId: string }>;
}) {
  const session = await requireStaffSession();
  const { purchaseOrderId } = await params;

  const purchaseOrder = await purchaseOrderRepository.findById(session.businessId, purchaseOrderId);
  if (!purchaseOrder) {
    notFound();
  }

  const supplier = await supplierRepository.findById(session.businessId, purchaseOrder.supplierId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/admin/purchase-orders"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Purchase orders
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{supplier?.name ?? purchaseOrder.supplierId}</h1>
            <PurchaseOrderStatusBadge status={purchaseOrder.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{formatKes(purchaseOrder.totalCostKes)} total</p>
        </div>
        {purchaseOrder.status === 'draft' || purchaseOrder.status === 'ordered' ? (
          <PurchaseOrderActions
            purchaseOrderId={purchaseOrderId}
            status={purchaseOrder.status}
            lineItems={purchaseOrder.lineItems.map((item) => ({ packageId: item.packageId, description: item.description }))}
          />
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Quantity</th>
                  <th className="px-4 py-3 font-medium">Unit cost</th>
                  <th className="px-4 py-3 font-medium">Line total</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrder.lineItems.map((item) => (
                  <tr key={item.packageId} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{item.description}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{item.quantity}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(item.unitCostKes)}</td>
                    <td className="px-4 py-3 font-medium tabular-nums text-foreground">{formatKes(item.quantity * item.unitCostKes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {purchaseOrder.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">{purchaseOrder.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {purchaseOrder.auditTrail.map((entry, index) => (
            <div key={index} className="flex items-baseline justify-between gap-4 py-2 text-sm">
              <div>
                <p className="font-medium text-foreground capitalize">{entry.action.replace(/_/g, ' ')}</p>
                {entry.note ? <p className="text-caption text-muted-foreground">{entry.note}</p> : null}
              </div>
              <span className="shrink-0 text-caption text-muted-foreground tabular-nums">{formatDateTime(entry.at)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
