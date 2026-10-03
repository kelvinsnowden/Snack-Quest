import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { listStuckPayments, lastAutomaticPaymentCheck } from '@/services/stuckPaymentService';
import { StuckPaymentsList } from '@/components/admin/StuckPaymentsList';
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

  const [{ events, nextCursor }, stuck, lastCheck] = await Promise.all([
    webhookEventRepository.listUnmatchedPayments(session.businessId, { cursor }),
    listStuckPayments(session.businessId),
    lastAutomaticPaymentCheck(session.businessId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Reconciliation</h1>
        <p className="hidden sm:block mt-1 text-sm text-muted-foreground">
          Payments that never became orders, and M-Pesa results that never matched a payment.
        </p>
      </div>

      <StuckPaymentsList payments={stuck} canComplete={hasPermission(session, 'payments.reconcile')} lastCheck={lastCheck} />

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
