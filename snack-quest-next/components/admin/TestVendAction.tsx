'use client';

import { useState } from 'react';
import { AlertTriangle, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DiagnosticVendResult {
  transactionRef: string;
  replay: boolean;
  authorized: boolean;
  commandRef: string | null;
  commandStatus: string | null;
  failureReason: string | null;
}

/** What the command's status means for the operator standing at the machine. */
function describeOutcome(result: DiagnosticVendResult): { tone: 'text-success' | 'text-warning' | 'text-danger'; text: string } {
  switch (result.commandStatus) {
    case 'sent':
      return { tone: 'text-success', text: 'Queued — the machine collects it on its next poll. Watch the machine, then check the dispense history below.' };
    case 'acknowledged':
    case 'dispensing':
      return { tone: 'text-success', text: 'Accepted by the machine; waiting for its outcome report.' };
    case 'dispensed':
      return { tone: 'text-success', text: 'The machine reported the product dispensed.' };
    case 'unknown':
    case 'timeout':
      return { tone: 'text-warning', text: `Outcome unknown — it may have dispensed. Check the machine before trying again. ${result.failureReason ?? ''}`.trim() };
    default:
      return { tone: 'text-danger', text: `Not dispensed: ${result.failureReason ?? 'refused'}` };
  }
}

/**
 * The diagnostics page's "Test vend" action. It really dispenses: it
 * goes through the dispense ledger like a sale (the machine receives a
 * real command, the outcome is tracked, stock leaves as waste), so the
 * browser confirm() is deliberate friction on top of the server's
 * `ADMIN_ONLY` check. One request id per confirmed vend: a double click
 * or a network retry reuses it, and the server never dispenses twice.
 */
export function TestVendAction({ machineId, slotCodes }: { machineId: string; slotCodes: string[] }) {
  const [slotCode, setSlotCode] = useState(slotCodes[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosticVendResult | null>(null);

  async function runTestVend() {
    if (!slotCode) {
      return;
    }
    if (!window.confirm(`This will attempt to physically dispense product from slot ${slotCode}. Continue?`)) {
      return;
    }
    const requestId = crypto.randomUUID();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/vending/machines/${machineId}/testVend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotCode, requestId }),
      });
      const data = (await response.json().catch(() => null)) as (DiagnosticVendResult & { error?: string }) | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Could not run the test vend (HTTP ${response.status}).`);
      }
      setResult(data);
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
        Requires admin. Sends the machine a real dispense command, exactly as a paid sale would. Not a simulation; the product is recorded as waste, not a sale.
      </p>
      {result ? (
        <p className={`text-sm ${describeOutcome(result).tone}`} role="status">
          {describeOutcome(result).text} ({result.transactionRef}{result.commandRef ? `, ${result.commandRef}` : ''})
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
