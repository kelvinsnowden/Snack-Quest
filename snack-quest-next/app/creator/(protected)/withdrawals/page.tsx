import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import { requireCreatorSession } from '@/lib/auth/creatorSession';
import { creatorDashboardService } from '@/services/creatorDashboardService';
import { withdrawalService } from '@/services/withdrawalService';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { WithdrawalStatusBadge } from '@/components/admin/WithdrawalStatusBadge';
import { RequestWithdrawalDialog } from '@/components/creator/RequestWithdrawalDialog';
import { formatDate, formatKes } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Withdrawals' };

export default async function CreatorWithdrawalsPage() {
  const session = await requireCreatorSession();
  const [{ profile }, { withdrawals }] = await Promise.all([
    creatorDashboardService.getDashboard(session.uid),
    withdrawalService.listWithdrawalsForOwner(session.businessId, session.uid),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title font-bold tracking-tight text-foreground">Withdrawals</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cash out your available balance to M-Pesa.</p>
        </div>
        <RequestWithdrawalDialog availableCashKes={profile.availableCashKes} defaultPhoneNumber={profile.payoutPhoneNumber} />
      </div>

      <Card>
        <CardContent className="p-6">
          <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Available balance</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">{formatKes(profile.availableCashKes)}</p>
        </CardContent>
      </Card>

      {withdrawals.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No withdrawals yet"
          description="Request a withdrawal once you have earnings available."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-caption font-medium tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">M-Pesa number</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map(({ id, data }) => (
                <tr key={id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(data.createdAt)}</td>
                  <td className="px-4 py-3 font-medium tabular-nums text-foreground">{formatKes(data.amountKes)}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{data.phoneNumber}</td>
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
