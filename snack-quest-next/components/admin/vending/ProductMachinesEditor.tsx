'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface ProductMachineRow {
  machineId: string;
  machineCode: string;
  place: string | null;
  carries: boolean;
  slots: { slotCode: string; quantity: number; priceKes: number }[];
  priceOverrideKes: number | null;
}

/**
 * Which machines carry one product, with the slots it's loaded in and
 * its price on each. Tick machines to add the product to them or take
 * it off them in one go. Taking it off only stops it being offered;
 * stock already in a slot stays until it's moved out.
 */
export function ProductMachinesEditor({ productCatalogue, productId, rows, canManage }: { productCatalogue: string; productId: string; rows: ProductMachineRow[]; canManage: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const pickedRows = rows.filter((row) => picked.has(row.machineId));

  async function apply(add: boolean) {
    setBusy(true);
    setResult(null);
    const done: string[] = [];
    try {
      for (const row of pickedRows.filter((entry) => entry.carries !== add)) {
        const response = add
          ? await fetch(`/api/vending/machines/${row.machineId}/assortment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productCatalogue, productId }) })
          : await fetch(`/api/vending/machines/${row.machineId}/assortment/${productCatalogue}/${encodeURIComponent(productId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unassort: true }) });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
          throw new Error(`${row.machineCode}: ${data?.message ?? data?.error ?? `HTTP ${response.status}`}`);
        }
        done.push(row.machineCode);
      }
      setResult({ ok: true, text: done.length ? `${add ? 'Added to' : 'Taken off'} ${done.join(', ')}.${add ? ' Link it to a slot on each machine so it can sell.' : ''}` : 'Nothing to change.' });
      setPicked(new Set());
    } catch (error) {
      setResult({ ok: false, text: `${done.length ? `Done for ${done.join(', ')}; then ` : ''}${error instanceof Error ? error.message : "couldn't save."}` });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              {canManage ? <th className="w-8 py-2"><span className="sr-only">Select</span></th> : null}
              <th className="py-2 pr-4 font-medium">Machine</th>
              <th className="py-2 pr-4 font-medium">Carries it</th>
              <th className="py-2 pr-4 font-medium">Slots</th>
              <th className="py-2 pr-4 font-medium">Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.machineId} className="border-b border-border last:border-0">
                {canManage ? (
                  <td className="py-2">
                    <input type="checkbox" aria-label={`Select ${row.machineCode}`} className="size-4 accent-[var(--color-primary)]" checked={picked.has(row.machineId)} onChange={() => { const next = new Set(picked); if (next.has(row.machineId)) next.delete(row.machineId); else next.add(row.machineId); setPicked(next); }} />
                  </td>
                ) : null}
                <td className="py-2 pr-4">
                  <Link href={`/admin/vending/${row.machineId}/catalogue`} className="font-medium text-foreground hover:underline">{row.machineCode}</Link>
                  {row.place ? <span className="block text-xs text-muted-foreground">{row.place}</span> : null}
                </td>
                <td className="py-2 pr-4">{row.carries ? <Badge variant="success">Yes</Badge> : <span className="text-muted-foreground">No</span>}</td>
                <td className="py-2 pr-4 tabular-nums text-muted-foreground">{row.slots.length ? row.slots.map((slot) => `${slot.slotCode} (${slot.quantity})`).join(', ') : '—'}</td>
                <td className="py-2 pr-4 tabular-nums text-foreground">
                  {row.priceOverrideKes !== null ? `KES ${row.priceOverrideKes.toLocaleString('en-KE')}` : row.slots.length ? [...new Set(row.slots.map((slot) => `KES ${slot.priceKes.toLocaleString('en-KE')}`))].join(' / ') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result ? (
        <p role={result.ok ? 'status' : 'alert'} className={`flex items-start gap-2 text-sm ${result.ok ? 'text-success' : 'text-danger'}`}>
          {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {result.text}
        </p>
      ) : null}
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || pickedRows.every((row) => row.carries)} loading={busy} onClick={() => apply(true)}>Add to selected</Button>
          <Button variant="outline" disabled={busy || pickedRows.every((row) => !row.carries)} onClick={() => apply(false)}>Take off selected</Button>
        </div>
      ) : null}
    </div>
  );
}
