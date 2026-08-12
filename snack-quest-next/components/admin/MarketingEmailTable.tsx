'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Mail, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { SerializedMarketingEmailCampaign } from '@/lib/marketingEmails/serialize';
import { SEGMENT_LABEL } from '@/lib/marketingEmails/segmentLabels';
import type { MarketingEmailStatus } from '@/types';

const STATUS_VARIANT: Record<MarketingEmailStatus, 'outline' | 'warning' | 'success' | 'danger'> = {
  draft: 'outline',
  sending: 'warning',
  sent: 'success',
  failed: 'danger',
};

export function MarketingEmailTable({
  campaigns,
  initialNextCursor,
}: {
  campaigns: SerializedMarketingEmailCampaign[];
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
      const response = await fetch(`/api/admin/marketing-emails?cursor=${encodeURIComponent(nextCursor)}`);
      if (!response.ok) return;
      const body = (await response.json()) as {
        campaigns: SerializedMarketingEmailCampaign[];
        nextCursor: string | null;
      };
      setRows((prev) => [...prev, ...body.campaigns]);
      setNextCursor(body.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function onDelete(id: string, subject: string) {
    if (!confirm(`Delete the draft "${subject}"? This can't be undone.`)) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/marketing-emails/${id}`, { method: 'DELETE' });
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
        icon={Mail}
        title="No campaigns yet"
        description="Compose your first branded email and send it to a real creator segment."
      />
    );
  }

  return (
    <>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border bg-border/20 text-left text-caption text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Segment</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sent / Recipients</th>
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
                      <Link href={`/admin/marketing-emails/${row.id}`} className="font-medium text-foreground hover:underline">
                        {row.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">{SEGMENT_LABEL[row.segment] ?? row.segment}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {row.status === 'draft' ? '—' : `${row.sentCount} / ${row.recipientCount}`}
                    </td>
                    <td className="px-4 py-3 text-caption text-muted-foreground">
                      {new Date(row.sentAt ?? row.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {row.status === 'draft' ? (
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onDelete(row.id, row.subject)}>
                            <Trash2 className="size-4 text-danger" aria-hidden="true" />
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
