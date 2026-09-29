'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Row = { slotCode: string; cached: number; ledgerDerived: number; matches: boolean };

/**
 * Compares each slot's count with the sum of its stock movements. Where
 * they differ, someone with machine_inventory.adjust can set the count
 * to the ledger's figure (with a reason). If the shelf itself is off
 * after that, a normal stock count fixes it.
 */
export function StockLedgerCheck({ machineId, canAlign }: { machineId: string; canAlign: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [aligning, setAligning] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/machines/${encodeURIComponent(machineId)}/stock-check`);
      const data = (await response.json().catch(() => null)) as { slots?: Row[]; error?: string } | null;
      if (!response.ok || !data?.slots) throw new Error(data?.error ?? `Couldn't check (HTTP ${response.status}).`);
      setRows(data.slots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check.");
    } finally {
      setBusy(false);
    }
  }

  async function align(slotCode: string) {
    setAligning(slotCode);
    setError(null);
    try {
      const response = await fetch(`/api/vending/machines/${encodeURIComponent(machineId)}/stock-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotCode, reason: reasons[slotCode] ?? '' }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? `Couldn't correct it (HTTP ${response.status}).`);
      await check();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't correct it.");
    } finally {
      setAligning(null);
    }
  }

  const mismatched = rows?.filter((row) => !row.matches) ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button size="sm" variant="outline" onClick={check} loading={busy}>
          Check counts against the stock ledger
        </Button>
      </div>
      {rows && mismatched.length === 0 ? (
        <p role="status" className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          All {rows.length} slots match their ledger.
        </p>
      ) : null}
      {mismatched.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Slot</th>
                <th className="py-2 pr-4 text-right font-medium">Count on the slot</th>
                <th className="py-2 pr-4 text-right font-medium">Ledger says</th>
                {canAlign ? <th className="py-2 font-medium">Correct it</th> : null}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {mismatched.map((row) => (
                <tr key={row.slotCode} className="border-b border-border last:border-0 align-top">
                  <td className="py-2 pr-4 font-medium text-foreground">{row.slotCode}</td>
                  <td className="py-2 pr-4 text-right text-danger">{row.cached}</td>
                  <td className="py-2 pr-4 text-right text-foreground">{row.ledgerDerived}</td>
                  {canAlign ? (
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          aria-label={`Why correct slot ${row.slotCode}`}
                          placeholder="Why"
                          value={reasons[row.slotCode] ?? ''}
                          onChange={(event) => setReasons((current) => ({ ...current, [row.slotCode]: event.target.value }))}
                          className="h-9 w-48"
                        />
                        <Button size="sm" onClick={() => align(row.slotCode)} loading={aligning === row.slotCode} disabled={!(reasons[row.slotCode] ?? '').trim() || row.ledgerDerived < 0}>
                          Set to {row.ledgerDerived}
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
