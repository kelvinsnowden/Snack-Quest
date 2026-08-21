'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { MobileRecordCard, MobileRecordList } from '@/components/admin/MobileRecordCard';
import type { SerializedMarketingSmsCampaign } from '@/lib/marketingSms/serialize';
import { SMS_SEGMENT_LABEL } from '@/lib/marketingSms/segmentLabels';
import type { MarketingSmsStatus } from '@/types';

const STATUS_VARIANT: Record<MarketingSmsStatus, 'outline' | 'warning' | 'success' | 'danger'> = {
  draft: 'outline',
  sending: 'warning',
  sent: 'success',
  failed: 'danger',
};

/** Cards on a phone, table from `md` up — the pattern every operational admin list uses. */
export function MarketingSmsTable({
  campaigns,
  initialNextCursor,
}: {
  campaigns: SerializedMarketingSmsCampaign[];
  initialNextCursor: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(campaigns);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/admin/marketing-sms?cursor=${encodeURIComponent(nextCursor)}`);
      if (!response.ok) return;
      const body = (await response.json()) as {
        campaigns: SerializedMarketingSmsCampaign[];
        nextCursor: string | null;
      };
      setRows((prev) => [...prev, ...body.campaigns]);
      setNextCursor(body.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete the draft "${name}"? This can't be undone.`)) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/marketing-sms/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not delete this draft.');
      }
      setRows((prev) => prev.filter((row) => row.id !== id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this draft.');
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No campaigns yet"
        description="Write a message, pick a customer segment, and see what it reaches and costs before you send it."
      />
    );
  }

  /** Draft rows have never resolved an audience, so a reach of 0/0 would read as a failed send rather than a campaign that has not run. */
  const reach = (row: SerializedMarketingSmsCampaign) =>
    row.status === 'draft' ? '—' : `${row.sentCount} / ${row.recipientCount}`;

  return (
    <>
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <MobileRecordList>
        {rows.map((row) => (
          <MobileRecordCard
            key={row.id}
            href={`/admin/marketing-sms/${row.id}`}
            title={row.name}
            badge={<Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>}
            fields={[
              { label: 'Segment', value: SMS_SEGMENT_LABEL[row.segment] ?? row.segment },
              { label: 'Sent', value: reach(row) },
              { label: 'Skipped (opted out)', value: row.status === 'draft' ? '—' : String(row.optedOutSkippedCount) },
              { label: 'Segments billed', value: row.status === 'draft' ? '—' : String(row.totalSegmentsSent) },
            ]}
            subtitle={new Date(row.sentAt ?? row.createdAt).toLocaleString()}
          />
        ))}
      </MobileRecordList>

      <Card className="hidden overflow-hidden p-0 md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border bg-border/20 text-left text-caption uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Segment</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sent / Reached</th>
                <th className="px-4 py-3 font-medium">Opted out</th>
                <th className="px-4 py-3 font-medium">Segments</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const busy = busyId === row.id;
                return (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-border/20">
                    <td className="px-4 py-3">
                      <Link href={`/admin/marketing-sms/${row.id}`} className="font-medium text-foreground hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">{SMS_SEGMENT_LABEL[row.segment] ?? row.segment}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{reach(row)}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {row.status === 'draft' ? '—' : row.optedOutSkippedCount}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {row.status === 'draft' ? '—' : row.totalSegmentsSent}
                    </td>
                    <td className="px-4 py-3 text-caption text-muted-foreground">
                      {new Date(row.sentAt ?? row.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {row.status === 'draft' ? (
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDelete(row.id, row.name)}>
                            <Trash2 className="size-4 text-danger" aria-hidden="true" />
                            <span className="sr-only">Delete draft</span>
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {nextCursor ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} loading={loadingMore}>
            Load more
          </Button>
        </div>
      ) : null}
    </>
  );
}
