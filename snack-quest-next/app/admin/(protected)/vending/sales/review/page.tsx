import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, ChevronRight } from 'lucide-react';
import { requireStaffSession } from '@/lib/auth/session';
import { vendingSaleReviewService, NEEDS_ATTENTION_STATUSES, type NeedsAttentionStatus } from '@/services/vendingSaleReviewService';
import { BUSINESS_TIME_ZONE } from '@/lib/vending/businessClock';
import { formatKes } from '@/lib/orders/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Sales to Review' };

const SECTION: Record<NeedsAttentionStatus, { title: string; explain: string }> = {
  manual_review: {
    title: 'Needs checking',
    explain: 'The machine couldn’t say whether the product came out. Check the slot, camera or customer, then confirm delivery or refund.',
  },
  paid_vend_failed: {
    title: 'Refund owed',
    explain: 'The customer paid and the machine reported it did not dispense. Refund them.',
  },
  refund_requested: {
    title: 'Refund to send',
    explain: 'A refund was decided but the money hasn’t gone back yet.',
  },
};

const dateTime = new Intl.DateTimeFormat('en-KE', { timeZone: BUSINESS_TIME_ZONE, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function waitingFor(from: Date, now: number): string {
  const minutes = Math.max(0, Math.round((now - from.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * The queue of sales the system would not decide on its own. Oldest first
 * in each group: whoever has waited longest for their snack or their money
 * comes first.
 */
export default async function SalesReviewPage() {
  const session = await requireStaffSession();
  const queue = await vendingSaleReviewService.listNeedingAttention(session.businessId, 100);
  const total = NEEDS_ATTENTION_STATUSES.reduce((sum, status) => sum + queue[status].length, 0);
  // eslint-disable-next-line react-hooks/purity -- a server component renders once per request; "now" is the request time.
  const now = Date.now();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <Link href="/admin/vending/sales" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All sales
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Sales to review</h1>
        <p className="text-sm text-muted-foreground">{total === 0 ? 'Nothing waiting on a decision.' : `${total} sale${total === 1 ? '' : 's'} waiting on a decision. Oldest first.`}</p>
      </div>

      {total === 0 ? (
        <EmptyState icon={CheckCircle2} title="All clear" description="Every sale either completed, failed without taking money, or has been refunded. New cases appear here automatically." />
      ) : null}

      {NEEDS_ATTENTION_STATUSES.filter((status) => queue[status].length > 0).map((status) => (
        <Card key={status}>
          <CardHeader>
            <CardTitle className="text-base">
              {SECTION[status].title} <span className="font-normal text-muted-foreground">({queue[status].length})</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{SECTION[status].explain}</p>
          </CardHeader>
          <CardContent className="p-0">
            <ul>
              {queue[status].map(({ id, sale, machineCode }) => (
                <li key={id} className="border-t border-border">
                  <Link href={`/admin/vending/sales/${id}`} className="flex items-center gap-4 px-6 py-3 hover:bg-border/20">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {sale.transactionRef}
                        <span className="ml-2 font-normal text-muted-foreground">{formatKes(sale.amountKes)} · {machineCode ?? sale.machineId} · slot {sale.slotId}</span>
                        {sale.paymentMethod === 'diagnostic' ? <span className="ml-2 text-xs text-muted-foreground">(staff test vend — no money involved)</span> : null}
                      </p>
                      {sale.failureReason ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{sale.failureReason}</p> : null}
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <p className="tabular-nums">{dateTime.format(sale.createdAt.toDate())}</p>
                      <p>waiting {waitingFor(sale.updatedAt.toDate(), now)}</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
