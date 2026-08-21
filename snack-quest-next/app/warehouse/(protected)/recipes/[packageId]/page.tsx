import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowLeft, ImageOff, MapPin, TriangleAlert } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { recipeService } from '@/services/recipeService';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Recipe' };

/**
 * One box's recipe (§ Box Recipes) — the screen someone actually works
 * from, on a phone, either at a market or a packing table.
 *
 * Photographs are large and first in the row on purpose. The person
 * reading this may not have bought this snack before, and a name in a
 * language they do not read is not enough to pick the right bag off a
 * shelf; the picture is the identifying information, and the text is
 * the confirmation. That is also why a missing photo is drawn as an
 * explicit placeholder rather than blank space — "no photo yet" is
 * useful, an empty square is confusing.
 */
export default async function WarehouseRecipeDetailPage({ params }: { params: Promise<{ packageId: string }> }) {
  const session = await requireStaffSession();
  const { packageId } = await params;
  const recipe = await recipeService.getRecipe(session.businessId, packageId);

  if (!recipe) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/warehouse/recipes"
          className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground active:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Recipes
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground md:text-3xl">{recipe.packageName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {recipe.lines.length} snack{recipe.lines.length === 1 ? '' : 's'} · KES{' '}
          <span className="tabular-nums">{recipe.totalCostKes.toLocaleString()}</span> to fill one box
        </p>
      </div>

      {recipe.notes ? (
        <Card className="bg-border/20 p-4">
          <p className="whitespace-pre-wrap text-sm text-foreground">{recipe.notes}</p>
        </Card>
      ) : null}

      {recipe.missingItemIds.length > 0 ? (
        <Card className="flex items-start gap-2.5 border-warning/40 p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-sm text-foreground">
            {recipe.missingItemIds.length} snack{recipe.missingItemIds.length === 1 ? '' : 's'} in this recipe
            {recipe.missingItemIds.length === 1 ? ' is' : ' are'} no longer in the catalogue, so
            {recipe.missingItemIds.length === 1 ? ' it' : ' they'} cannot be bought or priced. Ask an admin to fix the
            recipe.
          </p>
        </Card>
      ) : null}

      <ul className="flex flex-col gap-3">
        {recipe.lines.map((line) => (
          <li key={line.snackItemId}>
            <Card className="flex gap-3 p-3">
              <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-border/30">
                {line.item?.imageUrl ? (
                  <Image
                    src={line.item.imageUrl}
                    alt={line.item.name}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
                    <ImageOff className="size-5" aria-hidden="true" />
                    <span className="text-[10px]">No photo</span>
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                {line.item ? (
                  <>
                    <p className="font-semibold leading-tight text-foreground">{line.item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium tabular-nums text-foreground">
                        {line.quantity} {line.item.unitLabel}
                        {line.quantity === 1 ? '' : 's'}
                      </span>{' '}
                      · KES <span className="tabular-nums">{line.item.expectedUnitCostKes.toLocaleString()}</span> each
                      {' · '}
                      <span className="tabular-nums">KES {line.lineCostKes.toLocaleString()}</span>
                    </p>
                    {line.item.sourcingNote ? (
                      <p className="flex items-start gap-1 text-caption text-muted-foreground">
                        <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        <span>{line.item.sourcingNote}</span>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="font-semibold leading-tight text-warning">Snack no longer in the catalogue</p>
                    <p className="text-sm text-muted-foreground">
                      {line.quantity} needed · reference {line.snackItemId}
                    </p>
                  </>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
