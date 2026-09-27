import type { Metadata } from 'next';
import { Tag } from 'lucide-react';
import { requirePartnerSession } from '@/lib/auth/partnerSession';
import { ownerPortalService } from '@/services/ownerPortalService';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Products' };

const WINDOW_DAYS = 30;

/** § PRODUCTS (fleet-wide) — the Overview page's own "Top Selling Products" list, promoted to its own page with a longer window of results. */
export default async function PartnerProductsPage() {
  const session = await requirePartnerSession();
  const products = await ownerPortalService.getTopProducts(session.businessId, session.partnerId, WINDOW_DAYS, undefined, 25);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Products</h1>
        <p className="text-sm text-muted-foreground">Your best sellers across the last {WINDOW_DAYS} days, ranked by revenue.</p>
      </div>

      {products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No sales recorded yet.</p>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            {products.map((product, index) => (
              <div key={product.productId} className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                <Tag className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{product.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {product.unitsSold} units · KES {product.revenueKes.toLocaleString('en-KE')}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
