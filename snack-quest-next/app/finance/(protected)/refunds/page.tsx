import type { Metadata } from 'next';
import Link from 'next/link';
import { Undo2 } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { refundService } from '@/services/refundService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { RefundStatusBadge } from '@/components/admin/RefundStatusBadge';
import { formatDateTime, formatKes } from '@/lib/orders/format';
import type { RefundStatus } from '@/types';

export const metadata: Metadata = { title: 'Refunds' };

const STATUS_FILTERS: RefundStatus[] = ['pending', 'processing', 'succeeded', 'failed'];

/** The real refund ledger (§ RefundService + Daraja reversal support, § Finance workspace) — every Daraja reversal attempted, not just the intent flag on the order. */
export default async function FinanceRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { status, cursor } = await searchParams;
  const validStatus = STATUS_FILTERS.includes(status as RefundStatus) ? (status as RefundStatus) : undefined;

  const { refunds, nextCursor } = await refundService.listRefunds(session.businessId, {
    status: validStatus,
    cursor,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Refunds</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every M-Pesa reversal attempted, real Daraja outcomes only.</p>
      </div>

      <Card className="flex flex-wrap gap-2 p-4">
        <Link
          href="/finance/refunds"
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !status ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
          }`}
        >
          All
        </Link>
        {STATUS_FILTERS.map((value) => (
          <Link
            key={value}
            href={`/finance/refunds?status=${value}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              status === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
            }`}
          >
            {value}
          </Link>
        ))}
      </Card>

      {refunds.length === 0 ? (
        <EmptyState
          icon={Undo2}
          title="No refunds yet"
          description="Refunds appear here once a staff member initiates one from a refund-requested order."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map(({ id, data }) => (
                  <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3 text-xs tabular-nums text-foreground">{data.orderId}</td>
                    <td className="px-4 py-3 font-medium tabular-nums text-foreground">{formatKes(data.amountKes)}</td>
                    <td className="px-4 py-3">
                      <RefundStatusBadge status={data.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDateTime(data.createdAt)}</td>
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
            <Link href={`/finance/refunds?${status ? `status=${status}&` : ''}cursor=${nextCursor}`}>Load more</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
