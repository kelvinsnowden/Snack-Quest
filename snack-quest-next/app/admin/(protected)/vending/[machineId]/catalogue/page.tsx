import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { machineService } from '@/services/machineService';
import { machineSlotService } from '@/services/machineSlotService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { machineRepository } from '@/repositories/machineRepository';
import { listProductOptions } from '@/lib/vending/productOptions';
import { Card, CardContent } from '@/components/ui/card';
import { MachineCatalogueEditor } from '@/components/admin/vending/MachineCatalogueEditor';

export const metadata: Metadata = { title: 'What this machine sells' };

export default async function MachineCataloguePage({ params }: { params: Promise<{ machineId: string }> }) {
  const session = await requireStaffSession();
  const { machineId } = await params;
  const machine = await machineService.findById(session.businessId, machineId);
  if (!machine) notFound();
  const [rows, slots, products, machines] = await Promise.all([
    machineAssortmentService.listByMachine(session.businessId, machineId),
    machineSlotService.listByMachine(session.businessId, machineId),
    listProductOptions(session.businessId),
    machineRepository.listAllForBusiness(session.businessId),
  ]);
  const names = new Map(products.map((product) => [`${product.productCatalogue}:${product.productId}`, product.name]));

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href={`/admin/vending/${machineId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {machine.machineCode}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">What {machine.machineCode} sells</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Products here, linked to a slot that’s on and stocked, are what customers see. How each looks on the screen is edited under{' '}
          <Link href={`/admin/vending/${machineId}/screen`} className="text-primary hover:underline">customer screen</Link>; slots under{' '}
          <Link href={`/admin/vending/${machineId}/slots`} className="text-primary hover:underline">slots</Link>.
        </p>
      </div>
      <Card>
        <CardContent className="p-4 sm:p-6">
          <MachineCatalogueEditor
            machineId={machineId}
            rows={rows
              .map((row) => ({
                productCatalogue: row.productCatalogue,
                productId: row.productId,
                name: names.get(`${row.productCatalogue}:${row.productId}`) ?? row.productId,
                assorted: row.assorted,
                visible: row.visible,
                slotCode: row.slotCode,
                priceOverrideKes: row.priceOverrideKes,
              }))
              .sort((a, b) => a.name.localeCompare(b.name))}
            slots={slots.map((slot) => ({ slotCode: slot.slotCode, productKey: slot.productId ? `${slot.productCatalogue}:${slot.productId}` : '', priceKes: slot.priceKes }))}
            products={products}
            otherMachines={machines.filter(({ id, data }) => id !== machineId && data.status !== 'decommissioned').map(({ id, data }) => ({ id, code: data.machineCode })).sort((a, b) => a.code.localeCompare(b.code))}
            canManage={hasPermission(session, 'machine_catalog.manage')}
            canPrice={hasPermission(session, 'pricing.manage')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
