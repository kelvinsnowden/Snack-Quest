import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffSession } from '@/lib/auth/session';
import { supplierRepository } from '@/repositories/supplierRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { PurchaseOrderForm } from '@/components/admin/PurchaseOrderForm';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Warehouse } from 'lucide-react';

export const metadata: Metadata = { title: 'New purchase order' };

export default async function NewPurchaseOrderPage() {
  const session = await requireStaffSession();
  const [suppliers, products] = await Promise.all([
    supplierRepository.listByBusiness(session.businessId, { activeOnly: true }),
    packageRepository.listAllByBusiness(session.businessId),
  ]);

  if (suppliers.length === 0) {
    return (
      <div className="flex max-w-xl flex-col gap-6">
        <div>
          <h1 className="text-page-title font-bold tracking-tight text-foreground">New purchase order</h1>
        </div>
        <EmptyState
          icon={Warehouse}
          title="Add a supplier first"
          description="A purchase order needs a supplier to be placed with."
          action={
            <Button asChild>
              <Link href="/admin/suppliers">Add supplier</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">New purchase order</h1>
        <p className="mt-1 text-sm text-muted-foreground">Saved as a draft — order it once you&apos;re ready to send it to the supplier.</p>
      </div>
      <PurchaseOrderForm
        suppliers={suppliers.map(({ id, data }) => ({ id, name: data.name }))}
        products={products.map(({ id, data }) => ({ id, name: data.name }))}
      />
    </div>
  );
}
