import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, PackageSearch } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { inventoryBatchRepository } from '@/repositories/inventoryBatchRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { supplierRepository } from '@/repositories/supplierRepository';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { WriteOffBatchDialog } from '@/components/admin/WriteOffBatchDialog';
import { classifyBatchExpiry } from '@/lib/inventory/expiry';
import { formatDate, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Inventory batches' };

const EXPIRING_SOON_DAYS = 14;

export default async function AdminInventoryBatchesPage() {
  const session = await requireStaffSession();

  const [batches, products, suppliers] = await Promise.all([
    inventoryBatchRepository.listActive(session.businessId),
    packageRepository.listAllByBusiness(session.businessId),
    supplierRepository.listByBusiness(session.businessId),
  ]);
  const productNameById = new Map(products.map(({ id, data }) => [id, data.name]));
  const supplierNameById = new Map(suppliers.map(({ id, data }) => [id, data.name]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/inventory" className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Inventory
        </Link>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Batches</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every active batch received from a purchase order, with real cost and expiry.</p>
      </div>

      {batches.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No active batches"
          description="Batches appear here once a purchase order is received."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Remaining</th>
                  <th className="px-4 py-3 font-medium">Unit cost</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {batches.map(({ id, data }) => {
                  const status = classifyBatchExpiry(data.expiresAt, EXPIRING_SOON_DAYS);
                  return (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-4 py-3 font-medium text-foreground">{productNameById.get(data.packageId) ?? data.packageId}</td>
                      <td className="px-4 py-3 text-foreground">{supplierNameById.get(data.supplierId) ?? '—'}</td>
                      <td className="px-4 py-3 tabular-nums text-foreground">
                        {data.quantityRemaining} / {data.quantityReceived}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(data.unitCostKes)}</td>
                      <td className="px-4 py-3">
                        {status === 'none' ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="flex items-center gap-2 tabular-nums text-foreground">
                            {formatDate(data.expiresAt)}
                            {status === 'expired' ? <Badge variant="danger">Expired</Badge> : null}
                            {status === 'soon' ? <Badge variant="warning">Expiring soon</Badge> : null}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <WriteOffBatchDialog
                          batchId={id}
                          productName={productNameById.get(data.packageId) ?? data.packageId}
                          quantityRemaining={data.quantityRemaining}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
