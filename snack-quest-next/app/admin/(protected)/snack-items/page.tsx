import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/auth/requireAdminSection';
import { hasPermission } from '@/lib/auth/permissions';
import { recipeService } from '@/services/recipeService';
import { serializeSnackItem } from '@/lib/recipes/serialize';
import { SnackCatalogue } from '@/components/admin/SnackCatalogue';

export const metadata: Metadata = { title: 'Snacks' };

export default async function AdminSnackItemsPage() {
  const session = await requireAdminPage('orders', 'products.view');
  const canSeeCost = hasPermission(session, 'products.cost.view');
  const items = await recipeService.listSnackItems(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Snacks</h1>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
          The snacks you buy, with a photo and details each. Box recipes are built from these, so a correction here is
          a correction everywhere.
        </p>
      </div>

      <SnackCatalogue
        items={items.map(({ id, data }) => serializeSnackItem(id, data, { showCost: canSeeCost }))}
        canSeeCost={canSeeCost}
        canEditCost={hasPermission(session, 'products.cost.manage')}
        canEdit={hasPermission(session, 'products.snacks.manage')}
        priceAccess={{
          visible: canSeeCost || hasPermission(session, 'products.wholesale.view'),
          editable: [
            ...(hasPermission(session, 'products.cost.manage') ? (['landed_cost'] as const) : []),
            ...(hasPermission(session, 'products.wholesale.manage') ? (['owner_wholesale', 'retail_list'] as const) : []),
          ],
        }}
      />
    </div>
  );
}
