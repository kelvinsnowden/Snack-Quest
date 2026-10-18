import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { planogramTemplateRepository } from '@/repositories/planogramTemplateRepository';
import { listProductOptions } from '@/lib/vending/productOptions';
import { Card, CardContent } from '@/components/ui/card';
import { PlanogramTemplateList } from '@/components/admin/vending/PlanogramTemplateList';

export const metadata: Metadata = { title: 'Planogram templates' };

/** Saved slot layouts. Made from a machine's slots page; applied to many machines from "Change many machines". */
export default async function PlanogramsPage() {
  const session = await requireStaffSession();
  const [templates, products] = await Promise.all([planogramTemplateRepository.listByBusiness(session.businessId), listProductOptions(session.businessId)]);
  const productName = new Map(products.map((product) => [`${product.productCatalogue}:${product.productId}`, product.name]));
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href="/admin/vending" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Vending Machines
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Planogram templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">Save one from a machine&rsquo;s Slots page. Applying one sets slots, products, capacities and prices — never stock.</p>
      </div>
      <Card>
        <CardContent className="p-4 sm:p-6">
          <PlanogramTemplateList
            canManage={hasPermission(session, 'machines.slots.configure')}
            templates={templates.map(({ id, data }) => ({
              id,
              name: data.name,
              suitsFor: data.suitsFor,
              sourceMachineCode: data.sourceMachineCode,
              createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
              slots: data.slots.map((slot) => ({
                slotCode: slot.slotCode,
                product: slot.productId ? (productName.get(`${slot.productCatalogue}:${slot.productId}`) ?? slot.productId) : 'Empty',
                priceKes: slot.priceKes,
                capacity: slot.capacity,
              })),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
