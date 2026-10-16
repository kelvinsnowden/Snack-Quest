'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Reads the Meta leads Google Sheet now. Safe to press more than once. */
export function SyncSheetButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/vending/leads/sync-sheet', { method: 'POST' });
      const data = (await response.json().catch(() => null)) as
        | { created?: number; received?: number; error?: string }
        | null;
      if (!response.ok) throw new Error(data?.error ?? 'Sync failed. Please try again.');
      setMessage(
        data?.created
          ? `${data.created} new lead${data.created === 1 ? '' : 's'}.`
          : `Up to date — ${data?.received ?? 0} rows checked.`,
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sync failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={run}>
        <RefreshCw className="size-4" aria-hidden="true" />
        {busy ? 'Syncing…' : 'Sync sheet'}
      </Button>
      {message ? <p className="text-muted-foreground text-sm">{message}</p> : null}
    </div>
  );
}
