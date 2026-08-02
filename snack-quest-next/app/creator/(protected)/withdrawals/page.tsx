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
        <div className="border-border bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-caption text-muted-foreground border-b text-left font-medium tracking-wide uppercase">
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">M-Pesa number</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map(({ id, data }) => (
                <tr key={id} className="border-border border-b last:border-0">
                  <td className="text-muted-foreground px-4 py-3 tabular-nums">
                    {formatDate(data.createdAt)}
                  </td>
                  <td className="text-foreground px-4 py-3 font-medium tabular-nums">
                    {formatKes(data.amountKes)}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 tabular-nums">
                    {data.phoneNumber}
                  </td>
                  <td className="px-4 py-3">
                    <WithdrawalStatusBadge status={data.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
