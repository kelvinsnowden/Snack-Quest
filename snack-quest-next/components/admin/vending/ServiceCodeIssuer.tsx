'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Issues a one-time service code for this machine's screen
 * (§ KIOSK SERVICE MODE). The code is shown here once; it works for 15
 * minutes, once, on this machine only.
 */
export function ServiceCodeIssuer({ machineId }: { machineId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/machines/${machineId}/service-codes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Couldn’t issue a code (HTTP ${response.status}).`);
      setIssued({ code: body.code, expiresAt: body.expiresAt });
      setReason('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t issue a code.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {issued ? (
        <div role="status" className="flex flex-col gap-1 rounded-md border border-border p-4">
          <span className="text-sm text-muted-foreground">Give this code to the technician. It won’t be shown again.</span>
          <span className="font-mono text-section-title tracking-[0.25em] tabular-nums">{issued.code}</span>
          <span className="text-caption text-muted-foreground">
            Works once, on this machine, until {new Date(issued.expiresAt).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: 'numeric', minute: '2-digit' })}. On the screen: hold the logo for 3 seconds.
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Why is it needed?</span>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Screen not updating after a network change" className="min-h-10" />
        </label>
        <Button loading={busy} disabled={!reason.trim()} onClick={issue}>
          Issue service code
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
