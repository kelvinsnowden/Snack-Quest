import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { packageRepository } from '@/repositories/packageRepository';
import { InventoryStockTable } from '@/components/inventory/InventoryStockTable';

export const metadata: Metadata = { title: 'Inventory' };

export default async function WarehouseInventoryPage() {
  const session = await requireStaffSession();
  const products = await packageRepository.listAllByBusiness(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Inventory</h1>
        <p className="mt-1 text-sm text-muted-foreground">Stock levels for every box that tracks stock.</p>
      </div>
      <InventoryStockTable products={products} />
    </div>
  );
}
