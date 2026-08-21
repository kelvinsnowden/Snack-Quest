import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { recipeService } from '@/services/recipeService';
import { packageRepository } from '@/repositories/packageRepository';
import { boxRecipeRepository } from '@/repositories/boxRecipeRepository';
import { serializeSnackItem } from '@/lib/recipes/serialize';
import { BoxRecipeBuilder } from '@/components/admin/BoxRecipeBuilder';

export const metadata: Metadata = { title: 'Edit recipe' };

export default async function AdminRecipeEditPage({ params }: { params: Promise<{ packageId: string }> }) {
  const session = await requireStaffSession();
  const { packageId } = await params;

  const [box, recipe, catalogue] = await Promise.all([
    packageRepository.findById(session.businessId, packageId),
    boxRecipeRepository.findByPackageId(session.businessId, packageId),
    recipeService.listSnackItems(session.businessId),
  ]);

  if (!box) {
    notFound();
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <Link
          href="/admin/recipes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Box recipes
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">{box.name}</h1>
      </div>

      <BoxRecipeBuilder
        packageId={packageId}
        packageName={box.name}
        priceKes={box.priceKes}
        catalogue={catalogue.map(({ id, data }) => serializeSnackItem(id, data))}
        initialItems={recipe?.items ?? []}
        initialNotes={recipe?.notes ?? ''}
      />
    </div>
  );
}
