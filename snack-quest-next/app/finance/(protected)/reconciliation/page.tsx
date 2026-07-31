import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffSession } from '@/lib/auth/session';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { Button } from '@/components/ui/button';
import { UnmatchedPaymentsList } from '@/components/reconciliation/UnmatchedPaymentsList';

export const metadata: Metadata = { title: 'Reconciliation' };

/** The real reconciliation queue (§ Payment reconciliation, § Finance workspace) — same data and resolve action as `/admin/reconciliation`. */
export default async function FinanceReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { cursor } = await searchParams;

  const { events, nextCursor } = await webhookEventRepository.listUnmatchedPayments(session.businessId, { cursor });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Reconciliation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real M-Pesa STK callbacks Safaricom sent us that never matched a known payment attempt.
        </p>
      </div>

      <UnmatchedPaymentsList events={events} />

      {nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/finance/reconciliation?cursor=${nextCursor}`}>Load more</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
