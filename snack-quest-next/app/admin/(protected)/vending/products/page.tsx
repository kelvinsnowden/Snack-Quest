import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffSession } from '@/lib/auth/session';
import { machineRepository } from '@/repositories/machineRepository';
import { machineAssortmentRepository } from '@/repositories/machineAssortmentRepository';
import { listProductOptions } from '@/lib/vending/productOptions';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Products on machines' };

/** Every snack and box, with how many machines carry it — the way into "add this snack to these machines". */
export default async function ProductsOnMachinesPage() {
  const session = await requireStaffSession();
  const [products, machines] = await Promise.all([listProductOptions(session.businessId), machineRepository.listAllForBusiness(session.businessId)]);
  const live = machines.filter(({ data }) => data.status !== 'decommissioned');
  const rowsPerMachine = await Promise.all(live.map(({ id }) => machineAssortmentRepository.listByMachine(session.businessId, id)));
  const count = new Map<string, number>();
  for (const rows of rowsPerMachine) {
    for (const row of rows) {
      if (row.assorted) count.set(`${row.productCatalogue}:${row.productId}`, (count.get(`${row.productCatalogue}:${row.productId}`) ?? 0) + 1);
    }
  }
  const shown = products.filter((product) => product.active || count.has(`${product.productCatalogue}:${product.productId}`));

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Products on machines</h1>
        <p className="text-sm text-muted-foreground">How many of the {live.length} machines carry each snack and box. Open one to add it to machines or take it off.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {shown.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No products yet.</p> : (
            <ul className="divide-y divide-border">
              {shown.map((product) => (
                <li key={`${product.productCatalogue}:${product.productId}`}>
                  <Link href={`/admin/vending/products/${product.productCatalogue}/${encodeURIComponent(product.productId)}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-border/20 sm:px-6">
                    <span className="text-foreground">{product.name}{product.active ? '' : ' (inactive)'}</span>
                    <span className="tabular-nums text-muted-foreground">{count.get(`${product.productCatalogue}:${product.productId}`) ?? 0} machine{count.get(`${product.productCatalogue}:${product.productId}`) === 1 ? '' : 's'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
