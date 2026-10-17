import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { machineRepository } from '@/repositories/machineRepository';
import { locationService } from '@/services/locationService';
import { listProductOptions } from '@/lib/vending/productOptions';
import { Card, CardContent } from '@/components/ui/card';
import { BulkMachineEditor } from '@/components/admin/vending/BulkMachineEditor';

export const metadata: Metadata = { title: 'Change many machines' };

/** One change — status, a price, a product, a whole range — applied to the machines you pick. */
export default async function BulkMachinesPage() {
  const session = await requireStaffSession();
  const [machines, locations, products] = await Promise.all([
    machineRepository.listAllForBusiness(session.businessId),
    locationService.listByBusiness(session.businessId),
    listProductOptions(session.businessId),
  ]);
  const locationName = new Map(locations.map(({ id, data }) => [id, data.name]));
  const can = {
    status: hasPermission(session, 'machines.status.manage'),
    decommission: hasPermission(session, 'machines.decommission'),
    price: hasPermission(session, 'pricing.manage'),
    catalogue: hasPermission(session, 'machine_catalog.manage'),
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href="/admin/vending" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Vending Machines
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Change many machines</h1>
      </div>
      <Card>
        <CardContent className="p-4 sm:p-6">
          <BulkMachineEditor
            machines={machines
              .map(({ id, data }) => ({ id, code: data.machineCode, status: data.status, location: data.locationId ? (locationName.get(data.locationId) ?? '—') : 'Not placed' }))
              .sort((a, b) => a.code.localeCompare(b.code))}
            products={products.filter((product) => product.active).map(({ productCatalogue, productId, name }) => ({ productCatalogue, productId, name }))}
            can={can}
          />
        </CardContent>
      </Card>
    </div>
  );
}
