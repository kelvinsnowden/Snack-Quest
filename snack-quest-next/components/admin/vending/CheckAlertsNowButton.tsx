'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Runs the alert sweep now (at most once a minute across everyone), then reloads the list. */
export function CheckAlertsNowButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch('/api/vending/alerts/evaluate', { method: 'POST' });
      const data = (await response.json().catch(() => null)) as { ran?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
      setNote(data?.ran ? 'Checked just now.' : 'Checked less than a minute ago; showing that.');
      router.refresh();
    } catch (error) {
      setNote(error instanceof Error ? `Couldn't check: ${error.message}` : "Couldn't check.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button size="sm" variant="outline" loading={busy} onClick={run}>
        <RefreshCw className="size-4" aria-hidden="true" />
        Check now
      </Button>
      {note ? <span role="status" className="text-xs text-muted-foreground">{note}</span> : null}
    </div>
  );
}
