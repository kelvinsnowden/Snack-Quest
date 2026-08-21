import type { Metadata } from 'next';
import { requireStaffSession } from '@/lib/auth/session';
import { recipeService } from '@/services/recipeService';
import { serializeSnackItem } from '@/lib/recipes/serialize';
import { SnackCatalogue } from '@/components/admin/SnackCatalogue';

export const metadata: Metadata = { title: 'Snacks' };

export default async function AdminSnackItemsPage() {
  const session = await requireStaffSession();
  const items = await recipeService.listSnackItems(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Snacks</h1>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
          The snacks you buy, with a photo and price each. Box recipes are built from these, so a price corrected here
          is corrected everywhere.
        </p>
      </div>

      <SnackCatalogue items={items.map(({ id, data }) => serializeSnackItem(id, data))} />
    </div>
  );
}
