import type { Metadata } from 'next';
import Link from 'next/link';
import { PackageSearch } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { fulfillmentBatchRepository } from '@/repositories/fulfillmentBatchRepository';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Fulfillment batches' };

export default async function AdminFulfillmentBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { cursor } = await searchParams;
  const { batches, nextCursor } = await fulfillmentBatchRepository.listByBusiness(session.businessId, { cursor });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Fulfillment batches</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every shopping trip that covered a group of orders, and what it made.</p>
      </div>

      {batches.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No fulfillment batches yet"
          description="Select eligible orders from the Orders page and create your first fulfillment batch."
          action={
            <Button asChild>
              <Link href="/admin/orders">Go to orders</Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Orders</th>
                  <th className="px-4 py-3 font-medium">Revenue</th>
                  <th className="px-4 py-3 font-medium">Total cost</th>
                  <th className="px-4 py-3 font-medium">Gross profit</th>
                  <th className="px-4 py-3 font-medium">Margin</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3">
                      <Link href={`/admin/fulfillment-batches/${id}`} className="font-medium text-foreground hover:underline">
                        {data.orderCount} order{data.orderCount === 1 ? '' : 's'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(data.totalRevenueKes)}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{formatKes(data.costs.totalCostKes)}</td>
                    <td className={`px-4 py-3 font-medium tabular-nums ${data.grossProfitKes < 0 ? 'text-danger' : 'text-foreground'}`}>
                      {formatKes(data.grossProfitKes)}
                    </td>
                    <td className={`px-4 py-3 tabular-nums ${data.grossProfitKes < 0 ? 'text-danger' : 'text-foreground'}`}>
                      {data.profitMarginPct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(data.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/admin/fulfillment-batches?cursor=${nextCursor}`}>Load more</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
