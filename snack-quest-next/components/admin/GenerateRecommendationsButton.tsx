'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GenerateSummary {
  machinesChecked?: number;
  restock?: number;
  deadStock?: number;
  productOpportunities?: number;
}

/**
 * Runs the same fleet-wide generation the nightly job does, now. It
 * only ever adds `pending` recommendations — skipping anything already
 * waiting for a decision — so pressing it twice is harmless.
 */
export function GenerateRecommendationsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/vending/recommendations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'fleet' }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; status?: string; summary?: GenerateSummary; errors?: unknown[] } | null;
      if (!response.ok && response.status !== 500) {
        throw new Error(data?.error ?? `Could not generate recommendations (HTTP ${response.status}).`);
      }
      const summary = data?.summary ?? {};
      const added = (summary.restock ?? 0) + (summary.deadStock ?? 0) + (summary.productOpportunities ?? 0);
      const failures = data?.errors?.length ?? 0;
      setMessage(
        `Checked ${summary.machinesChecked ?? 0} selling machine${summary.machinesChecked === 1 ? '' : 's'} — ${added === 0 ? 'nothing new to suggest' : `${added} new recommendation${added === 1 ? '' : 's'}`}.` +
          (failures > 0 ? ` ${failures} could not be checked; see Operations for details.` : ''),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate recommendations.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={generate} loading={busy} size="sm">
        <RefreshCw className="size-4" aria-hidden="true" />
        Generate now
      </Button>
      {message ? <p role="status" className="max-w-xs text-right text-xs text-muted-foreground">{message}</p> : null}
      {error ? (
        <p role="alert" className="flex max-w-xs items-start gap-1.5 text-right text-xs text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
