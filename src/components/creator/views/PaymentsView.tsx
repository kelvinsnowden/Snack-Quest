import React from 'react';
import { Wallet, Clock } from 'lucide-react';
import { StatCard } from '../../common/StatCard';
import { StatusBadge } from '../../common/StatusBadge';
import { ErrorState } from '../../common/ErrorState';
import { EmptyState } from '../../common/EmptyState';
import { DataTable, Column } from '../../common/DataTable';
import { CreatorDashboardPayload, WithdrawalRecord } from '../creatorApi';
import { formatKes } from '../format';

interface PaymentsViewProps {
  payload: CreatorDashboardPayload | null;
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

export const PaymentsView: React.FC<PaymentsViewProps> = ({ payload, loading, error, onRetry, onOpenWithdraw }) => {
  if (loading) {
    return <div className="h-64 bg-creator-surface border border-creator-border rounded-creator-card animate-pulse" aria-hidden="true" />;
  }
  if (error) return <ErrorState title="Couldn't load payouts" message={error} onRetry={onRetry} />;
  if (!payload) return null;

  const { wallet, withdrawal_history } = payload;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-creator-section-title font-bold text-creator-ink">Payments</h1>
        <button
          type="button"
          onClick={onOpenWithdraw}
          disabled={wallet.available_balance_kes <= 0}
          className="px-4 py-2.5 rounded-creator-control bg-creator-brand hover:bg-creator-brand-strong text-creator-brand-ink font-bold text-creator-caption transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Withdraw
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-md">
        <StatCard label="Available balance" value={formatKes(wallet.available_balance_kes)} icon={Wallet} />
        <StatCard label="Pending payouts" value={formatKes(wallet.pending_payouts_kes)} icon={Clock} />
      </div>

      {withdrawal_history.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No payout history yet"
          description="Your withdrawal requests and their status will show up here."
          actionLabel={wallet.available_balance_kes > 0 ? 'Withdraw now' : undefined}
          onAction={wallet.available_balance_kes > 0 ? onOpenWithdraw : undefined}
        />
      ) : (
        <DataTable
          title="Payout history"
          data={withdrawal_history}
          columns={columns}
          searchKey="phone_number"
          searchPlaceholder="Search by M-Pesa number..."
          exportFilename="creator_payouts"
        />
      )}
    </div>
  );
};
