import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { withdrawalService } from '@/services/withdrawalService';
import { EmptyState } from '@/components/ui/empty-state';
import { RequestWithdrawalDialog } from '@/components/creator/RequestWithdrawalDialog';
import { formatDate, formatKes, toIsoString } from '@/lib/orders/format';
import { PortalPageHeader } from '@/components/creator/design/PortalPageHeader';
import { PortalCard } from '@/components/creator/design/PortalCard';
import { WithdrawalsHistoryList } from '@/components/creator/WithdrawalsHistoryList';

export const metadata: Metadata = { title: 'Withdrawals' };

export default async function CreatorWithdrawalsPage() {
  const session = await requireCreatorSession();
  const [{ profile }, { withdrawals }] = await Promise.all([
    creatorDashboardService.getDashboard(session.businessId, session.uid),
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
        <WithdrawalsHistoryList
          rows={withdrawals.map(({ id, data }) => ({
            id,
            amountKes: data.amountKes,
            phoneNumber: data.phoneNumber,
            status: data.status,
            createdAtIso: toIsoString(data.createdAt),
            createdAtDisplay: formatDate(data.createdAt),
          }))}
        />
      )}
    </div>
  );
}
