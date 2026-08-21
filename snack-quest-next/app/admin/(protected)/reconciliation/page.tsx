import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffSession } from '@/lib/auth/session';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { Button } from '@/components/ui/button';
import { UnmatchedPaymentsList } from '@/components/reconciliation/UnmatchedPaymentsList';
import { ReconcileNowButton } from '@/components/admin/ReconcileNowButton';

export const metadata: Metadata = { title: 'Reconciliation' };

export default async function AdminReconciliationPage({
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
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Reconciliation</h1>
        <p className="hidden sm:block mt-1 text-sm text-muted-foreground">
          Real M-Pesa STK callbacks Safaricom sent us that never matched a known payment attempt.
        </p>
      </div>

      <ReconcileNowButton />

      <UnmatchedPaymentsList events={events} />

      {nextCursor ? (
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/admin/reconciliation?cursor=${nextCursor}`}>Load more</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
