'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, PackageCheck, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProductPhoto } from '@/components/warehouse/ProductPhoto';
import type { TripPackProduct } from '@/lib/vending/tripPackList';

/**
 * Packing for the whole round from one list: every product once, with
 * the total to take and how it splits between machines, so the rider
 * fills the bag in one pass along the shelves. Tap a tile when it's in;
 * ticks stay on this phone if the page reloads. One button starts
 * packing (so the office sees it), then one sets every machine on the
 * round off together.
 */
export function TripPackCard({
  tripKey,
  products,
  totalItems,
  machineCount,
  canStartPacking,
  waitingForApproval,
}: {
  /** Identifies this round's set of restocks, so ticks from an earlier round aren't reused. */
  tripKey: string;
  products: TripPackProduct[];
  totalItems: number;
  machineCount: number;
  /** True while some restock is approved but nobody has started packing it. */
  canStartPacking: boolean;
  waitingForApproval: number;
}) {
  const router = useRouter();
  const storageKey = `sq-trip-packed:${tripKey}`;
  const [packed, setPacked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring this phone's ticks after load; the server render has none
      if (saved) setPacked(new Set(JSON.parse(saved) as string[]));
    } catch {
      // Storage blocked: ticks just won't survive a reload.
    }
  }, [storageKey]);

  function toggle(key: string) {
    setPacked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // Storage blocked: fine, the ticks are only a packing aid.
      }
      return next;
    });
  }

  async function advance(step: 'pack' | 'leave') {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/vending/technician-jobs/trip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step }) });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? 'That didn’t save. Check your signal and try again.');
      if (step === 'leave') {
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // Nothing to clean up.
        }
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save.');
    } finally {
      setBusy(false);
    }
  }

  const left = products.length - products.filter((product) => packed.has(product.key)).length;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-6" aria-labelledby="trip-pack">
      <header className="flex flex-col gap-1">
        <span className="self-start rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">Before you leave</span>
        <h2 id="trip-pack" className="text-xl font-semibold text-foreground">
          Pack for this trip
        </h2>
        <p className="text-sm text-muted-foreground">
          {totalItems} items for {machineCount} machine{machineCount === 1 ? '' : 's'} · {products.length - left}/{products.length} packed
        </p>
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {products.map((product) => {
          const done = packed.has(product.key);
          return (
            <li key={product.key}>
              <button
                type="button"
                aria-pressed={done}
                onClick={() => toggle(product.key)}
                className={cn(
                  'relative flex w-full flex-col gap-2 rounded-2xl border p-2 text-left transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  done ? 'border-success bg-success/10' : 'border-border bg-background hover:border-primary/40',
                )}
              >
                <ProductPhoto src={product.imageUrl} alt={product.name} size="tile" />
                <span className="absolute right-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-lg font-bold tabular-nums text-foreground shadow-sm">×{product.quantity}</span>
                {done ? (
                  <span className="absolute left-3 top-3 flex size-8 items-center justify-center rounded-full bg-success text-success-foreground">
                    <Check className="size-5" aria-hidden="true" />
                  </span>
                ) : null}
                <span className="line-clamp-2 text-sm font-medium leading-tight text-foreground">{product.name}</span>
                {machineCount > 1 ? (
                  <span className="flex flex-wrap gap-1">
                    {product.machines.map((machine) => (
                      <span key={machine.machineId} className="rounded-md bg-muted/50 px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                        {machine.machineCode} ×{machine.quantity}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Slot {product.machines[0]?.slots.join(', ')}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {waitingForApproval > 0 ? (
        <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
          {waitingForApproval} more restock{waitingForApproval === 1 ? ' is' : 's are'} waiting for the office to approve, so {waitingForApproval === 1 ? 'it isn’t' : 'they aren’t'} in this list yet.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {canStartPacking ? (
        <Button type="button" size="lg" onClick={() => advance('pack')} loading={busy}>
          <PackageCheck className="size-5" aria-hidden="true" />
          Start packing
        </Button>
      ) : (
        <Button type="button" size="lg" onClick={() => advance('leave')} loading={busy}>
          <Truck className="size-5" aria-hidden="true" />
          {left > 0 ? `Packed — start the round (${left} not ticked)` : 'Packed — start the round'}
        </Button>
      )}
    </section>
  );
}
