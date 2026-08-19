import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { packageRepository } from '@/repositories/packageRepository';
import { inventoryBatchRepository } from '@/repositories/inventoryBatchRepository';
import { InventoryStockTable } from '@/components/inventory/InventoryStockTable';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Inventory' };

const EXPIRING_SOON_DAYS = 14;

export default async function AdminInventoryPage() {
  const session = await requireStaffSession();
  const [products, expiringBatches] = await Promise.all([
    packageRepository.listAllByBusiness(session.businessId),
    inventoryBatchRepository.listExpiringSoon(session.businessId, EXPIRING_SOON_DAYS),
  ]);
  const productNameById = new Map(products.map(({ id, data }) => [id, data.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Inventory</h1>
          <p className="hidden sm:block mt-1 text-sm text-muted-foreground">Stock levels for every box that tracks stock.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/inventory/batches">View batches</Link>
        </Button>
      </div>

      {expiringBatches.length > 0 ? (
        <Card className="flex items-start gap-3 border-warning/40 bg-warning/5 p-4">
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {expiringBatches.length} batch{expiringBatches.length === 1 ? '' : 'es'} expiring within {EXPIRING_SOON_DAYS} days
            </p>
            <ul className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
              {expiringBatches.slice(0, 5).map(({ id, data }) => (
                <li key={id}>
                  {productNameById.get(data.packageId) ?? data.packageId} — {data.quantityRemaining} remaining, expires {formatDate(data.expiresAt)}
                </li>
              ))}
            </ul>
            <Link href="/admin/inventory/batches" className="mt-2 inline-block text-sm text-primary hover:underline">
              View all batches
            </Link>
          </div>
        </Card>
      ) : null}

      <InventoryStockTable products={products} productHref={(id) => `/admin/products/${id}`} />
    </div>
  );
}
