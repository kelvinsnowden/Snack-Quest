import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { withdrawalService } from '@/services/withdrawalService';
import { EmptyState } from '@/components/ui/empty-state';
import { WithdrawalStatusBadge } from '@/components/admin/WithdrawalStatusBadge';
import { RequestWithdrawalDialog } from '@/components/creator/RequestWithdrawalDialog';
import { formatDate, formatKes } from '@/lib/orders/format';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';
import { PortalCard } from '@/components/creator/design/PortalCard';

export const metadata: Metadata = { title: 'Withdrawals' };

export default async function CreatorWithdrawalsPage() {
  const session = await requireCreatorSession();
  const [{ profile }, { withdrawals }] = await Promise.all([
    creatorDashboardService.getDashboard(session.uid),
    withdrawalService.listWithdrawalsForOwner(session.businessId, session.uid),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <PortalPageHeader
          title="Withdrawals"
          description="Cash out your available balance to M-Pesa."
        />
        <RequestWithdrawalDialog
          availableCashKes={profile.availableCashKes}
          defaultPhoneNumber={profile.payoutPhoneNumber}
        />
      </div>

      <PortalCard className="">
        <p className="text-caption text-muted-foreground font-medium tracking-wide uppercase">
          Available balance
        </p>
        <p className="text-foreground mt-1 text-3xl font-semibold tabular-nums">
          {formatKes(profile.availableCashKes)}
        </p>
      </PortalCard>

      {withdrawals.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No withdrawals yet"
          description="Request a withdrawal once you have earnings available."
        />
      ) : (
        <ul className="border-border divide-border bg-surface divide-y overflow-hidden rounded-lg border">
          {withdrawals.map(({ id, data }) => (
            <li key={id} className="flex items-center gap-3 p-4">
              <span
                aria-hidden="true"
                className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full"
              >
                <Wallet className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate font-medium tabular-nums">
                  {formatKes(data.amountKes)}
                </p>
                <p className="text-muted-foreground text-sm tabular-nums">
                  {formatDate(data.createdAt)} · {data.phoneNumber}
                </p>
              </div>
              <div className="shrink-0">
                <WithdrawalStatusBadge status={data.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
