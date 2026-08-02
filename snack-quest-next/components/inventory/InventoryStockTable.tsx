import Link from 'next/link';
import { AlertTriangle, Boxes } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { InventoryAdjustDialog } from '@/components/admin/InventoryAdjustDialog';
import type { Package } from '@/types';

/**
 * The stock-level table shared by `/admin/inventory` and
 * `/warehouse/inventory` (§ Admin: Inventory, § Warehouse workspace) —
 * same real data (`packageRepository.listAllByBusiness`), same
 * `InventoryAdjustDialog` write path, presented in both workspaces
 * rather than maintained as two copies.
 */

type StockStatus = 'unlimited' | 'out_of_stock' | 'low_stock' | 'in_stock';

function stockStatus(stockCount: number | undefined, lowStockThreshold: number | undefined): StockStatus {
  if (stockCount === undefined) return 'unlimited';
  if (stockCount <= 0) return 'out_of_stock';
  if (lowStockThreshold !== undefined && stockCount <= lowStockThreshold) return 'low_stock';
  return 'in_stock';
}

const STATUS_LABEL: Record<StockStatus, string> = {
  unlimited: 'Unlimited',
  out_of_stock: 'Out of stock',
  low_stock: 'Low stock',
  in_stock: 'In stock',
};

const STATUS_VARIANT: Record<StockStatus, BadgeProps['variant']> = {
  unlimited: 'outline',
  out_of_stock: 'danger',
  low_stock: 'warning',
  in_stock: 'success',
};

export function InventoryStockTable({
  products,
  productHref,
}: {
  products: { id: string; data: Package }[];
  /** When provided, the product name links to its detail page (e.g. `/admin/products` has one; `/warehouse` doesn't). */
  productHref?: (id: string) => string;
}) {
  const tracked = products.filter(({ data }) => data.stockCount !== undefined);
  const attentionCount = tracked.filter(({ data }) => {
    const status = stockStatus(data.stockCount, data.lowStockThreshold);
    return status === 'low_stock' || status === 'out_of_stock';
  }).length;

  return (
    <div className="flex flex-col gap-6">
      {attentionCount > 0 ? (
        <Card className="flex items-center gap-3 border-warning/40 bg-warning/5 p-4">
          <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-sm text-foreground">
            {attentionCount} product{attentionCount === 1 ? '' : 's'} need{attentionCount === 1 ? 's' : ''} attention —
            low or out of stock.
          </p>
        </Card>
      ) : null}

      {products.length === 0 ? (
        <EmptyState icon={Boxes} title="No products yet" description="Add a product first, then manage its stock here." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {products.map(({ id, data }) => {
                  const status = stockStatus(data.stockCount, data.lowStockThreshold);
                  return (
                    <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {productHref ? (
                          <Link href={productHref(id)} className="hover:underline">
                            {data.name}
                          </Link>
                        ) : (
                          data.name
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-foreground">
                        {data.stockCount === undefined ? '—' : data.stockCount}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {data.stockCount !== undefined ? (
                          <InventoryAdjustDialog packageId={id} productName={data.name} currentStock={data.stockCount} />
                        ) : null}
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
