import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { machineRepository } from '@/repositories/machineRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineAssortmentRepository } from '@/repositories/machineAssortmentRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { Card, CardContent } from '@/components/ui/card';
import { ProductMachinesEditor } from '@/components/admin/vending/ProductMachinesEditor';

export const metadata: Metadata = { title: 'Machines carrying a product' };

export default async function ProductMachinesPage({ params }: { params: Promise<{ productCatalogue: string; productId: string }> }) {
  const session = await requireStaffSession();
  const { productCatalogue, productId: rawId } = await params;
  const productId = decodeURIComponent(rawId);
  if (productCatalogue !== 'snackItem' && productCatalogue !== 'package') notFound();
  const product = productCatalogue === 'snackItem' ? await snackItemRepository.findById(productId) : await packageRepository.findById(session.businessId, productId);
  if (!product || (product as { businessId?: string }).businessId !== session.businessId) notFound();

  const [machines, rows, slots] = await Promise.all([
    machineRepository.listAllForBusiness(session.businessId),
    machineAssortmentRepository.listByProduct(session.businessId, productCatalogue, productId),
    machineSlotRepository.listByBusiness(session.businessId),
  ]);
  const byMachine = new Map(rows.map((row) => [row.machineId, row]));
  const productSlots = slots.filter((slot) => slot.productId === productId && slot.productCatalogue === productCatalogue);
  const list = machines
    .filter(({ data }) => data.status !== 'decommissioned')
    .map(({ id, data }) => ({
      machineId: id,
      machineCode: data.machineCode,
      place: data.venueName,
      carries: byMachine.get(id)?.assorted === true,
      slots: productSlots.filter((slot) => slot.machineId === id).map((slot) => ({ slotCode: slot.slotCode, quantity: slot.currentQuantity, priceKes: slot.priceKes })),
      priceOverrideKes: byMachine.get(id)?.assorted ? (byMachine.get(id)?.priceOverrideKes ?? null) : null,
    }))
    .sort((a, b) => Number(b.carries) - Number(a.carries) || a.machineCode.localeCompare(b.machineCode));
  const carrying = list.filter((row) => row.carries).length;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href="/admin/vending/products" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Products on machines
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{product.name}</h1>
        <p className="text-sm text-muted-foreground">
          On {carrying} of {list.length} machine{list.length === 1 ? '' : 's'}.
        </p>
      </div>
      <Card>
        <CardContent className="p-4 sm:p-6">
          <ProductMachinesEditor productCatalogue={productCatalogue} productId={productId} rows={list} canManage={hasPermission(session, 'machine_catalog.manage')} />
        </CardContent>
      </Card>
    </div>
  );
}
