'use client';

import { useMemo, useState } from 'react';
import { Search, ShoppingBag } from 'lucide-react';
import { groupByDateLabel } from '@/lib/creator/dateGroups';
import { formatKes } from '@/lib/orders/format';
import { EmptyState } from '@/components/ui/empty-state';

/** `createdAt` is pre-formatted server-side — a Firestore Timestamp can't cross the Server → Client Component boundary as a prop. */
export interface EarningsRow {
  id: string;
  orderId: string;
  createdAtIso: string;
  createdAtDisplay: string;
  discountKes: number;
  commissionKes: number;
}

/**
 * Search + date-grouped commission history (§ Creator Portal premium
 * rebuild, date-grouped history). The list itself was already correct
 * — this only adds the ability to scan by day instead of a flat
 * ledger, and to jump straight to one order when the list gets long.
 */
export function EarningsHistoryList({ rows }: { rows: EarningsRow[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.orderId.toLowerCase().includes(q) ||
        String(row.commissionKes).includes(q) ||
        String(row.discountKes).includes(q),
    );
  }, [rows, query]);

  const groups = useMemo(
    () => groupByDateLabel(filtered, (row) => row.createdAtIso),
    [filtered],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by order ID or amount"
          aria-label="Search commission history"
          className="border-border bg-surface text-foreground placeholder:text-muted-foreground focus-visible:ring-primary focus-visible:ring-offset-background h-10 w-full rounded-full border pr-4 pl-9 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No matching commissions"
          description="Try a different order ID or amount."
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
                      className="bg-success/10 text-success flex size-10 shrink-0 items-center justify-center rounded-full"
                    >
                      <ShoppingBag className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate font-medium">
                        Order {row.orderId}
                      </p>
                      <p className="text-muted-foreground text-sm tabular-nums">
                        {row.createdAtDisplay} · {formatKes(row.discountKes)} discount given
                      </p>
                    </div>
                    <p className="text-success shrink-0 font-semibold tabular-nums">
                      +{formatKes(row.commissionKes)}
                    </p>
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
