'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SerializedAlert } from '@/lib/vending/serialize';

/**
 * § PART 6 — ALERT CENTER. Two actions, matching the alert's own
 * lifecycle (`types/alert.ts`): acknowledge just claims it, resolve
 * requires a note — the form itself won't submit an empty one, same
 * discipline `StockDiscrepancyForm` already uses for its own required
 * reason.
 */
export function AlertActions({ alert }: { alert: SerializedAlert }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'acknowledge' | 'resolve' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState('');

  async function acknowledge() {
    setBusy('acknowledge');
    setError(null);
    try {
      const response = await fetch(`/api/vending/alerts/${alert.id}/acknowledge`, { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Could not acknowledge (HTTP ${response.status}).`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not acknowledge.');
    } finally {
      setBusy(null);
    }
  }

  async function resolve() {
    if (!resolution.trim()) return;
    setBusy('resolve');
    setError(null);
    try {
      const response = await fetch(`/api/vending/alerts/${alert.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Could not resolve (HTTP ${response.status}).`);
      }
      setResolving(false);
      setResolution('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve.');
    } finally {
      setBusy(null);
    }
  }

  if (resolving) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            placeholder="Resolution note (required)"
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            className="h-8 w-48 text-xs"
          />
          <Button size="sm" variant="outline" onClick={resolve} loading={busy === 'resolve'} disabled={!resolution.trim()}>
            <Check className="size-3.5" aria-hidden="true" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setResolving(false); setResolution(''); }}>
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {alert.status === 'open' ? (
          <Button size="sm" variant="outline" onClick={acknowledge} loading={busy === 'acknowledge'}>
            Acknowledge
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => setResolving(true)}>
          Resolve
        </Button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
