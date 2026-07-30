import React from 'react';
import { Wallet, Clock } from 'lucide-react';
import { StatCard } from '../../common/StatCard';
import { StatusBadge } from '../../common/StatusBadge';
import { ErrorState } from '../../common/ErrorState';
import { EmptyState } from '../../common/EmptyState';
import { DataTable, Column } from '../../common/DataTable';
import { CreatorAccount, WithdrawalRecord } from '../creatorApi';
import { formatKes } from '../format';

interface PaymentsViewProps {
  creator: CreatorAccount;
  withdrawals: WithdrawalRecord[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenWithdraw: () => void;
}

const columns: Column<WithdrawalRecord>[] = [
  {
    header: 'Requested',
    accessorKey: 'created_at',
    sortable: true,
    cell: (row) => new Date(row.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })
  },
  { header: 'Amount', accessorKey: 'amount_kes', sortable: true, cell: (row) => formatKes(row.amount_kes) },
  { header: 'M-Pesa number', accessorKey: 'phone_number' },
  { header: 'Status', accessorKey: 'status', cell: (row) => <StatusBadge status={row.status} size="sm" /> }
];

export const PaymentsView: React.FC<PaymentsViewProps> = ({ creator, withdrawals, loading, error, onRetry, onOpenWithdraw }) => {
  if (loading) {
    return <div className="h-64 bg-creator-surface border border-creator-border rounded-creator-card animate-pulse" aria-hidden="true" />;
  }
  if (error) return <ErrorState title="Couldn't load payouts" message={error} onRetry={onRetry} />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-creator-section-title font-bold text-creator-ink">Payments</h1>
        <button
          type="button"
          onClick={onOpenWithdraw}
          disabled={creator.available_cash <= 0}
          className="px-4 py-2.5 rounded-creator-control bg-creator-brand hover:bg-creator-brand-strong text-creator-brand-ink font-bold text-creator-caption transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Withdraw
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-md">
        <StatCard label="Available cash" value={formatKes(creator.available_cash)} icon={Wallet} />
        <StatCard label="Pending earnings" value={formatKes(creator.pending_earnings)} icon={Clock} />
      </div>

      {withdrawals.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No payout history yet"
          description="Your withdrawal requests and their status will show up here."
          actionLabel={creator.available_cash > 0 ? 'Withdraw now' : undefined}
          onAction={creator.available_cash > 0 ? onOpenWithdraw : undefined}
        />
      ) : (
        <DataTable
          title="Payout history"
          data={withdrawals}
          columns={columns}
          searchKey="phone_number"
          searchPlaceholder="Search by M-Pesa number..."
          exportFilename="creator_payouts"
        />
      )}
    </div>
  );
};
