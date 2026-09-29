'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/**
 * Adds a planned list of products to one machine's catalogue, one at a
 * time through the ordinary catalogue route (so each addition is checked
 * and audited like any other). Products it already carries are left as
 * they are. Nothing is priced, slotted or stocked here.
 */
export function ApplyPlanToMachine({ productIds, machines }: { productIds: string[]; machines: { id: string; label: string }[] }) {
  const [machineId, setMachineId] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ machineId: string; added: number; failed: string[] } | null>(null);

  async function apply() {
    setBusy(true);
    setDone(null);
    const failed: string[] = [];
    let added = 0;
    for (const [index, productId] of productIds.entries()) {
      try {
        const response = await fetch(`/api/vending/machines/${encodeURIComponent(machineId)}/assortment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, productCatalogue: 'snackItem', displayOrder: index }),
        });
        if (response.ok) added += 1;
        else failed.push(productId);
      } catch {
        failed.push(productId);
      }
    }
    setDone({ machineId, added, failed });
    setBusy(false);
  }

  if (machines.length === 0) return <p className="text-sm text-muted-foreground">Register the machine first; then its catalogue can be filled from this list.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-machine">Add these to a machine’s catalogue</Label>
          <select id="plan-machine" value={machineId} onChange={(event) => setMachineId(event.target.value)} disabled={busy} className="h-10 min-w-56 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="">Choose a machine…</option>
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.label}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={apply} loading={busy} disabled={!machineId}>
          Add {productIds.length} product{productIds.length === 1 ? '' : 's'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Products it already carries keep their settings. Prices, slots and stock are set on the machine afterwards.</p>
      {done ? (
        <p role={done.failed.length ? 'alert' : 'status'} className={`flex items-start gap-2 text-sm ${done.failed.length ? 'text-danger' : 'text-success'}`}>
          {done.failed.length ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          <span>
            Added {done.added} of {productIds.length}.{done.failed.length ? ` ${done.failed.length} couldn’t be added (${done.failed.join(', ')}).` : ''}{' '}
            <Link href={`/admin/vending/${done.machineId}/catalogue`} className="underline">
              Open its catalogue
            </Link>
          </span>
        </p>
      ) : null}
    </div>
  );
}
