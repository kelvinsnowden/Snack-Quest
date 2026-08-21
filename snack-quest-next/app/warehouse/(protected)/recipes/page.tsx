import type { Metadata } from 'next';
import Link from 'next/link';
import { ChefHat, ChevronRight, TriangleAlert } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { recipeService } from '@/services/recipeService';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Recipes' };

/**
 * Every box and what goes in it (§ Box Recipes).
 *
 * Built for a phone held in one hand, because that is the only way it
 * will be used — a runner on a bike, or someone at a packing table.
 * Rows are full-width tap targets rather than a table: there is no
 * horizontal room to lose to columns, and nothing here needs comparing
 * side by side.
 */
export default async function WarehouseRecipesPage() {
  const session = await requireStaffSession();
  const coverage = await recipeService.listRecipeCoverage(session.businessId);

  const withRecipe = coverage.filter((row) => row.hasRecipe);
  const withoutRecipe = coverage.filter((row) => !row.hasRecipe);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Recipes</h1>
        <p className="mt-1 text-sm text-muted-foreground">What goes inside each box, and what it costs to fill.</p>
      </div>

      {coverage.length === 0 ? (
        <EmptyState icon={ChefHat} title="No boxes yet" description="Boxes appear here once they exist in the catalogue." />
      ) : null}

      {withRecipe.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {withRecipe.map((row) => (
            <li key={row.packageId}>
              <Link
                href={`/warehouse/recipes/${row.packageId}`}
                className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition-colors active:bg-border/30"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-semibold text-foreground">{row.packageName}</span>
                  <span className="text-caption text-muted-foreground">
                    {row.itemCount} snack{row.itemCount === 1 ? '' : 's'} · KES{' '}
                    <span className="tabular-nums">{row.totalCostKes.toLocaleString()}</span> to fill
                  </span>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {withoutRecipe.length > 0 ? (
        <Card className="flex flex-col gap-3 border-warning/40 p-4">
          <div className="flex items-start gap-2.5">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-foreground">
                {withoutRecipe.length} box{withoutRecipe.length === 1 ? '' : 'es'} with no recipe
              </p>
              <p className="text-sm text-muted-foreground">
                These cannot be shopped for. A shopping run that includes one will say so rather than quietly buying
                too little.
              </p>
            </div>
          </div>
          <ul className="flex flex-col gap-1 pl-7">
            {withoutRecipe.map((row) => (
              <li key={row.packageId} className="text-sm text-foreground">
                {row.packageName}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
