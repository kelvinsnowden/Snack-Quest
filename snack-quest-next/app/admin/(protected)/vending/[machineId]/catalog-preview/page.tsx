import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Package } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { machineService } from '@/services/machineService';
import { machineAssortmentService } from '@/services/machineAssortmentService';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Catalog Preview' };

const STATE_LABEL: Record<string, string> = {
  available: '',
  sold_out: 'Sold out',
  unavailable: 'Unavailable',
  coming_soon: 'Coming soon',
  hidden: 'Hidden (customer never sees this)',
};

/**
 * § PART 3 — CATALOG PREVIEW: "what the customer currently sees,"
 * generated from the same sellable catalog the real machine screen
 * reads — `machineAssortmentService.getSellableCatalog`/`getCatalogVersion`
 * are the exact two calls `GET /api/vending/machines/[id]/catalog`
 * makes for the machine itself (called directly here, server-side,
 * rather than through that device-authenticated HTTP route, which a
 * staff session was never issued a credential for). Never a second,
 * separately-maintained mock of the catalog — see that route's own
 * doc comment.
 */
export default async function AdminMachineCatalogPreviewPage({ params }: { params: Promise<{ machineId: string }> }) {
  const session = await requireStaffSession();
  const { machineId } = await params;

  const machine = await machineService.findById(session.businessId, machineId);
  if (!machine) {
    notFound();
  }

  const [items, catalogVersion] = await Promise.all([
    machineAssortmentService.getSellableCatalog(session.businessId, machineId),
    machineAssortmentService.getCatalogVersion(session.businessId, machineId),
  ]);

  const visibleItems = items.filter((item) => item.availabilityState !== 'hidden');
  const categories = Array.from(new Set(visibleItems.map((item) => item.category).filter((c): c is string => Boolean(c)))).sort();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <Link href={`/admin/vending/${machineId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to {machine.machineCode}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-foreground">Catalog Preview &mdash; {machine.machineCode}</h1>
        <p className="text-sm text-muted-foreground">
          Exactly what the customer screen would show right now, from catalog version <code className="rounded bg-border/40 px-1 py-0.5">{catalogVersion}</code>.
          {items.length !== visibleItems.length ? ` ${items.length - visibleItems.length} item(s) are hidden from the customer and omitted below.` : ''}
        </p>
      </div>

      {visibleItems.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">This machine has no sellable items right now — the customer screen would show an empty menu.</CardContent>
        </Card>
      ) : (
        categories.length === 0 ? (
          <ItemGrid items={visibleItems} />
        ) : (
          <div className="flex flex-col gap-6">
            {categories.map((category) => (
              <div key={category}>
                <h2 className="mb-3 text-lg font-semibold text-foreground">{category}</h2>
                <ItemGrid items={visibleItems.filter((item) => item.category === category)} />
              </div>
            ))}
            {visibleItems.some((item) => !item.category) ? (
              <div>
                <h2 className="mb-3 text-lg font-semibold text-foreground">Uncategorized</h2>
                <ItemGrid items={visibleItems.filter((item) => !item.category)} />
              </div>
            ) : null}
          </div>
        )
      )}
    </div>
  );
}

function ItemGrid({ items }: { items: Awaited<ReturnType<typeof machineAssortmentService.getSellableCatalog>> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const purchasable = item.availabilityState === 'available';
        return (
          <div key={`${item.productCatalogue}:${item.productId}`} className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            <div className="aspect-square w-full overflow-hidden">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a staff preview of the real machine catalog image, not a Next-optimizable static asset.
                <img src={item.imageUrl} alt={item.name} className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/15 to-secondary/15 text-primary">
                  <Package className="size-8" aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3">
              <p className="text-sm font-semibold text-foreground">{item.name}</p>
              {!purchasable ? <span className="w-fit rounded-full bg-border/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">{STATE_LABEL[item.availabilityState]}</span> : null}
              <span className="mt-auto text-base font-bold text-foreground">KES {item.priceKes.toLocaleString('en-KE')}</span>
              <span className="text-xs text-muted-foreground">Slot {item.slotCode}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
