import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { shoppingRunService, ShoppingRunNotFoundError } from '@/services/shoppingRunService';
import { serializeShoppingRun } from '@/lib/recipes/serialize';
import { ShoppingRunList } from '@/components/warehouse/ShoppingRunList';
import { CompleteShoppingRun } from '@/components/warehouse/CompleteShoppingRun';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Shopping list' };

export default async function ShoppingRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const session = await requireStaffSession();
  const { runId } = await params;

  let run;
  try {
    run = await shoppingRunService.getRun(session.businessId, runId);
  } catch (error) {
    if (error instanceof ShoppingRunNotFoundError) {
      notFound();
    }
    throw error;
  }

  const serialized = serializeShoppingRun(runId, run);

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div>
        <Link
          href="/warehouse/shopping"
          className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground active:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Shopping
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Shopping list
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For {run.orderCount} order{run.orderCount === 1 ? '' : 's'}
        </p>
      </div>

      {run.missingRecipePackageIds.length > 0 ? (
        <Card className="flex items-start gap-2.5 border-warning/40 p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-sm text-foreground">
            {run.missingRecipePackageIds.length} box
            {run.missingRecipePackageIds.length === 1 ? '' : 'es'} in these orders had no recipe, so nothing was added
            for {run.missingRecipePackageIds.length === 1 ? 'it' : 'them'}. You will need to work those out yourself.
          </p>
        </Card>
      ) : null}

      <ShoppingRunList run={serialized} />

      <CompleteShoppingRun
        runId={runId}
        status={run.status}
        remaining={run.lines.filter((line) => !line.purchased).length}
      />
    </div>
  );
}
