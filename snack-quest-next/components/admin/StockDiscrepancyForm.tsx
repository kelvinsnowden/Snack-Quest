'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * § STOCK DISCREPANCY — a physical count against a slot's expected
 * quantity. A reason is required by the form itself (not just the
 * server) so the person doing the count is prompted for one before
 * ever submitting, and the result is always shown — including when
 * the count matched exactly, since that's still a real fact worth
 * confirming, not a silent no-op.
 */
export function StockDiscrepancyForm({ machineId, slotCodes }: { machineId: string; slotCodes: string[] }) {
  const router = useRouter();
  const [slotCode, setSlotCode] = useState(slotCodes[0] ?? '');
  const [physicalCountQuantity, setPhysicalCountQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ expectedQuantity: number; discrepancy: number } | null>(null);

  async function submit() {
    if (!slotCode || physicalCountQuantity.trim() === '' || !reason.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/vending/machines/${machineId}/slots/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotCode, physicalCountQuantity: Number(physicalCountQuantity), reason }),
      });
      const data = (await response.json().catch(() => null)) as { expectedQuantity?: number; discrepancy?: number; error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Could not record the count (HTTP ${response.status}).`);
      }
      setResult({ expectedQuantity: data?.expectedQuantity ?? 0, discrepancy: data?.discrepancy ?? 0 });
      setPhysicalCountQuantity('');
      setReason('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the count.');
    } finally {
      setBusy(false);
    }
  }

  if (slotCodes.length === 0) {
    return <p className="text-sm text-muted-foreground">No slots configured yet — a stock count needs a real slot to target.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={slotCode} onChange={(event) => setSlotCode(event.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          {slotCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <Input
          type="number"
          inputMode="numeric"
          placeholder="Physical count"
          value={physicalCountQuantity}
          onChange={(event) => setPhysicalCountQuantity(event.target.value)}
          className="h-9 w-36"
        />
        <Input
          type="text"
          placeholder="Reason (required)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="h-9 w-56"
        />
        <Button onClick={submit} loading={busy} size="sm" variant="outline" disabled={!reason.trim() || physicalCountQuantity.trim() === ''}>
          <ClipboardCheck className="size-4" aria-hidden="true" />
          Record count
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">
        Compares the physical count against the slot&apos;s expected quantity and writes a real inventory adjustment ledger entry either way.
      </p>
      {result ? (
        <p className={`text-sm ${result.discrepancy === 0 ? 'text-success' : 'text-warning'}`}>
          {result.discrepancy === 0
            ? 'Count matches — no discrepancy.'
            : `Discrepancy of ${result.discrepancy > 0 ? '+' : ''}${result.discrepancy} against an expected ${result.expectedQuantity}.`}
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
