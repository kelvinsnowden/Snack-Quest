'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Approve/dismiss for one recommendation (§ RECOMMENDATION ENGINE:
 * never auto-executed — a staff decision is the only thing that moves
 * it out of `pending`). `actionTaken` is free text on what the staff
 * member actually did, stored verbatim for the outcome-tracking read
 * later (§ LEARNING FROM RECOMMENDATIONS).
 */
export function RecommendationActions({ recommendationId }: { recommendationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: 'approve' | 'dismiss') {
    const actionTaken = window.prompt(kind === 'approve' ? 'What did you do?' : 'Why are you dismissing this?');
    if (!actionTaken) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/recommendations/${recommendationId}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionTaken }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Could not ${kind} (HTTP ${response.status}).`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${kind}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Button onClick={() => act('approve')} loading={busy} size="sm" variant="outline">
          <Check className="size-4" aria-hidden="true" />
          Approve
        </Button>
        <Button onClick={() => act('dismiss')} loading={busy} size="sm" variant="outline">
          <X className="size-4" aria-hidden="true" />
          Dismiss
        </Button>
      </div>
      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
