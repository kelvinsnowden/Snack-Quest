'use client';

import { useState } from 'react';
import { AlertTriangle, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The diagnostics page's "Test vend" action (§ DIAGNOSTICS PAGE:
 * "Require elevated permission for actual test vend"). Only shown
 * when the caller already confirmed `hasCapability(..., 'vend')` —
 * same discipline as `IssueMachineCommandAction`'s own gate — but
 * this one has a real physical/financial consequence a remote restart
 * doesn't: it actually dispenses product from a live slot, so the
 * browser confirm() below is deliberate friction on top of the
 * server's own `ADMIN_ONLY` check, not a replacement for it.
 */
export function TestVendAction({ machineId, slotCodes }: { machineId: string; slotCodes: string[] }) {
  const [slotCode, setSlotCode] = useState(slotCodes[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ authorized: boolean; reason: string | null; vendRef: string } | null>(null);

  async function runTestVend() {
    if (!slotCode) {
      return;
    }
    if (!window.confirm(`This will attempt to physically dispense product from slot ${slotCode}. Continue?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/vending/machines/${machineId}/testVend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotCode }),
      });
      const data = (await response.json().catch(() => null)) as
        | { authorized?: boolean; reason?: string | null; vendRef?: string; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Could not run the test vend (HTTP ${response.status}).`);
      }
      setResult({ authorized: Boolean(data?.authorized), reason: data?.reason ?? null, vendRef: data?.vendRef ?? '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run the test vend.');
    } finally {
      setBusy(false);
    }
  }

  if (slotCodes.length === 0) {
    return <p className="text-sm text-muted-foreground">No slots configured yet — a test vend needs a real slot to target.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={slotCode}
          onChange={(event) => setSlotCode(event.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          {slotCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <Button onClick={runTestVend} loading={busy} size="sm" variant="outline">
          <PlayCircle className="size-4" aria-hidden="true" />
          Test vend
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">
        Requires admin — calls the machine&apos;s adapter live and really attempts to dispense. Not a simulation.
      </p>
      {result ? (
        <p className={`text-sm ${result.authorized ? 'text-success' : 'text-warning'}`}>
          {result.authorized ? 'Authorized' : 'Refused'} — {result.reason ?? 'no reason given'} (vendRef: {result.vendRef})
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
