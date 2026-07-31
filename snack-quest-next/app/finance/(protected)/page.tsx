import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffSession } from '@/lib/auth/session';
import { withdrawalService } from '@/services/withdrawalService';
import { userRepository } from '@/repositories/userRepository';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyWithdrawalsState } from '@/components/admin/EmptyWithdrawalsState';
import { WithdrawalStatusBadge } from '@/components/admin/WithdrawalStatusBadge';
import { WithdrawalActions } from '@/components/admin/WithdrawalActions';
import { WITHDRAWAL_STATUS_LABELS } from '@/lib/withdrawals/format';
import { formatDate, formatKes } from '@/lib/orders/format';
import type { WithdrawalStatus } from '@/types';

export const metadata: Metadata = { title: 'Withdrawals' };

const STATUS_FILTERS: WithdrawalStatus[] = ['pending', 'approved', 'paid', 'rejected', 'failed'];

/** Finance's own withdrawal-approval queue (§ Finance workspace) — the same real data and actions as `/admin/withdrawals`, in the focused workspace this role actually lives in day to day. */
export default async function FinanceWithdrawalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const session = await requireStaffSession();
  const { status, cursor } = await searchParams;
  const validStatus = STATUS_FILTERS.includes(status as WithdrawalStatus) ? (status as WithdrawalStatus) : undefined;

  const { withdrawals, nextCursor } = await withdrawalService.listWithdrawals(session.businessId, {
    status: validStatus,
    cursor,
  });

  const owners = await Promise.all(withdrawals.map(({ data }) => userRepository.findById(data.ownerId)));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-bold tracking-tight text-foreground">Withdrawals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review and release creator payout requests via M-Pesa.
        </p>
      </div>

      <Card className="flex flex-wrap gap-2 p-4">
        <Link
          href="/finance"
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            !status ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
          }`}
        >
          All
        </Link>
        {STATUS_FILTERS.map((value) => (
          <Link
            key={value}
            href={`/finance?status=${value}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              status === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-border/40'
            }`}
          >
            {WITHDRAWAL_STATUS_LABELS[value]}
          </Link>
        ))}
      </Card>

      {withdrawals.length === 0 ? (
        <EmptyWithdrawalsState hasFilter={Boolean(status)} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {withdrawals.map(({ id, data }, index) => (
                  <tr key={id} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{owners[index]?.displayName ?? data.ownerId}</span>
                      <span className="block text-caption text-muted-foreground capitalize">{data.ownerType}</span>
                    </td>
                    <td className="px-4 py-3 font-medium tabular-nums text-foreground">{formatKes(data.amountKes)}</td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{data.phoneNumber}</td>
                    <td className="px-4 py-3">
                      <WithdrawalStatusBadge status={data.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{formatDate(data.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {data.status === 'pending' ? <WithdrawalActions withdrawalId={id} amountKes={data.amountKes} /> : null}
                    </td>
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
            <Link href={`/finance?${status ? `status=${status}&` : ''}cursor=${nextCursor}`}>Load more</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
