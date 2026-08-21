import type { Metadata } from 'next';
import Link from 'next/link';
import { ChefHat, ChevronRight } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { recipeService } from '@/services/recipeService';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Box recipes' };

export default async function AdminRecipesPage() {
  const session = await requireStaffSession();
  const coverage = await recipeService.listRecipeCoverage(session.businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Box recipes</h1>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
          What goes in each box, and whether it still makes money at the price you sell it for.
        </p>
      </div>

      {coverage.length === 0 ? (
        <EmptyState icon={ChefHat} title="No boxes yet" description="Add a box in Products first." />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {coverage.map((row) => {
            const margin = row.priceKes - row.totalCostKes;
            return (
              <li key={row.packageId}>
                <Link
                  href={`/admin/recipes/${row.packageId}`}
                  className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-border/20"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-foreground">{row.packageName}</span>
                      {row.hasRecipe ? null : <Badge variant="warning">no recipe</Badge>}
                    </div>
                    <span className="text-caption text-muted-foreground">
                      {row.hasRecipe ? (
                        <>
                          {row.itemCount} snack{row.itemCount === 1 ? '' : 's'} · costs KES{' '}
                          <span className="tabular-nums">{row.totalCostKes.toLocaleString()}</span> · margin{' '}
                          <span className={`tabular-nums ${margin < 0 ? 'text-danger' : ''}`}>
                            KES {margin.toLocaleString()}
                          </span>
                        </>
                      ) : (
                        <>Sells for KES {row.priceKes.toLocaleString()} — nothing defined yet</>
                      )}
                    </span>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
