'use client';

import { useMemo, useState } from 'react';
import { Search, Wallet } from 'lucide-react';
import { groupByDateLabel } from '@/lib/creator/dateGroups';
import { formatKes } from '@/lib/orders/format';
import { WithdrawalStatusBadge } from '@/components/admin/WithdrawalStatusBadge';
import { WITHDRAWAL_STATUS_LABELS } from '@/lib/withdrawals/format';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import type { WithdrawalStatus } from '@/types';

/** `createdAt` is pre-formatted server-side — a Firestore Timestamp can't cross the Server → Client Component boundary as a prop. */
export interface WithdrawalRow {
  id: string;
  amountKes: number;
  phoneNumber: string;
  status: WithdrawalStatus;
  createdAtIso: string;
  createdAtDisplay: string;
}

const STATUS_FILTERS: { value: WithdrawalStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
];

/**
 * Filter pills + search + date-grouped withdrawal history (§ Creator
 * Portal premium rebuild, date-grouped history). Status filters only
 * list statuses that actually occur in `rows` (besides "All") — a
 * creator who has only ever been paid shouldn't see four empty pill
 * options for statuses they've never hit.
 */
export function WithdrawalsHistoryList({ rows }: { rows: WithdrawalRow[] }) {
  const [status, setStatus] = useState<WithdrawalStatus | 'all'>('all');
  const [query, setQuery] = useState('');

  const availableStatuses = useMemo(() => new Set(rows.map((r) => r.status)), [rows]);
  const visibleFilters = STATUS_FILTERS.filter(
    (f) => f.value === 'all' || availableStatuses.has(f.value),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (!q) return true;
      return (
        row.phoneNumber.toLowerCase().includes(q) ||
        String(row.amountKes).includes(q)
      );
    });
  }, [rows, status, query]);

  const groups = useMemo(
    () => groupByDateLabel(filtered, (row) => row.createdAtIso),
    [filtered],
  );

  return (
    <div className="flex flex-col gap-4">
      {visibleFilters.length > 2 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          {visibleFilters.map((filter) => {
            const active = status === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatus(filter.value)}
                aria-pressed={active}
                className={cn(
                  'focus-visible:ring-primary focus-visible:ring-offset-background shrink-0 rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'border-border bg-surface text-muted-foreground hover:text-foreground border',
                )}
              >
                {filter.value === 'all'
                  ? 'All'
                  : WITHDRAWAL_STATUS_LABELS[filter.value].split(' — ')[0]}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by phone number or amount"
          aria-label="Search withdrawal history"
          className="border-border bg-surface text-foreground placeholder:text-muted-foreground focus-visible:ring-primary focus-visible:ring-offset-background h-10 w-full rounded-full border pr-4 pl-9 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No matching withdrawals"
          description="Try a different filter, phone number, or amount."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <p className="text-caption text-muted-foreground px-1 font-semibold tracking-wide uppercase">
                {group.label}
              </p>
              <ul className="border-border divide-border bg-surface divide-y overflow-hidden rounded-lg border">
                {group.items.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 p-4">
                    <span
                      aria-hidden="true"
                      className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full"
                    >
                      <Wallet className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate font-medium tabular-nums">
                        {formatKes(row.amountKes)}
                      </p>
                      <p className="text-muted-foreground text-sm tabular-nums">
                        {row.createdAtDisplay} · {row.phoneNumber}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <WithdrawalStatusBadge status={row.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
