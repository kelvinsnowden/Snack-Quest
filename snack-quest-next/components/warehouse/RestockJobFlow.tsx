'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Check, Minus, PackageCheck, Plus, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface RestockLine {
  /** The slot's id on the restock (`machineId__A01`). */
  slotId: string;
  slotCode: string;
  productId: string | null;
  name: string;
  imageUrl: string | null;
  /** What to pack (planned), or what was packed once dispatched. */
  quantity: number;
}

export interface RestockJobData {
  taskId: string;
  status: 'draft' | 'approved' | 'picking' | 'dispatched' | 'in_transit';
  lines: RestockLine[];
}

const STEPS = [
  { key: 'pack', label: 'Pack' },
  { key: 'travel', label: 'On the way' },
  { key: 'load', label: 'Load' },
] as const;

function stepOf(status: RestockJobData['status']): number {
  if (status === 'in_transit') return 2;
  if (status === 'dispatched') return 1;
  return 0;
}

function Photo({ src, alt, size }: { src: string | null; alt: string; size: 'tile' | 'row' }) {
  return (
    <span className={cn('relative block shrink-0 overflow-hidden rounded-xl bg-muted/40', size === 'tile' ? 'aspect-square w-full' : 'size-16')}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={size === 'tile' ? '(max-width: 640px) 45vw, 200px' : '64px'} className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center px-1 text-center text-xs font-medium text-warning">No photo</span>
      )}
    </span>
  );
}

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (next: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <Button type="button" size="icon" variant="outline" className="size-11 rounded-full" onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`One fewer ${label}`}>
        <Minus className="size-5" aria-hidden="true" />
      </Button>
      <span className="w-10 text-center text-xl font-semibold tabular-nums text-foreground" aria-live="polite">
        {value}
      </span>
      <Button type="button" size="icon" variant="outline" className="size-11 rounded-full" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`One more ${label}`}>
        <Plus className="size-5" aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * A restock on the technician's phone, one stage at a time:
 *
 * 1. **Pack** — a pick list of product photos, one tile per product with
 *    how many to take (slots carrying the same product are added up), so
 *    packing is matching pictures to shelves. Tap a tile once it's in the
 *    bag; "Packed" tells the system and starts the trip.
 * 2. **On the way** — one button, for a restock someone else packed.
 * 3. **Load** — slot by slot in the machine's order, photo beside the
 *    slot code, a big − / + defaulted to what was packed. Fewer in, and
 *    the note asks why. Finishing records what went in, which adds the
 *    stock and closes the job.
 */
export function RestockJobFlow({
  restock,
  busy,
  onAdvance,
  loaded,
  setLoaded,
}: {
  restock: RestockJobData;
  busy: boolean;
  /** Runs a stage change on the restock (`start-picking`, `dispatch`, `mark-in-transit`). */
  onAdvance: (path: string, body?: unknown) => Promise<boolean>;
  loaded: Record<string, number>;
  setLoaded: (next: Record<string, number>) => void;
}) {
  const step = stepOf(restock.status);
  const [packed, setPacked] = useState<Set<string>>(new Set());

  // One tile per product: what to take off the shelf, however many slots it goes into.
  const pickList = useMemo(() => {
    const byProduct = new Map<string, { key: string; name: string; imageUrl: string | null; quantity: number; slots: string[] }>();
    for (const line of restock.lines) {
      const key = line.productId ?? `slot:${line.slotId}`;
      const entry = byProduct.get(key) ?? { key, name: line.name, imageUrl: line.imageUrl, quantity: 0, slots: [] };
      entry.quantity += line.quantity;
      entry.slots.push(line.slotCode);
      byProduct.set(key, entry);
    }
    return [...byProduct.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [restock.lines]);
  const totalItems = restock.lines.reduce((sum, line) => sum + line.quantity, 0);

  async function packedAndLeaving() {
    const dispatched = await onAdvance('/dispatch', { items: restock.lines.map((line) => ({ slotId: line.slotId, quantityDispatched: line.quantity })) });
    if (dispatched) await onAdvance('/mark-in-transit');
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="grid grid-cols-3 gap-2" aria-label="Restock steps">
        {STEPS.map((entry, index) => (
          <li key={entry.key} aria-current={index === step ? 'step' : undefined} className="flex flex-col gap-1.5">
            <span className={cn('h-1.5 rounded-full', index < step ? 'bg-success' : index === step ? 'bg-primary' : 'bg-border')} />
            <span className={cn('text-xs font-medium', index === step ? 'text-foreground' : 'text-muted-foreground')}>{entry.label}</span>
          </li>
        ))}
      </ol>

      {restock.status === 'draft' ? <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">Waiting for the office to approve this restock. It’ll be ready to pack once they do.</p> : null}

      {step === 0 && restock.status !== 'draft' ? (
        <section className="flex flex-col gap-3" aria-labelledby={`pick-${restock.taskId}`}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 id={`pick-${restock.taskId}`} className="text-base font-semibold text-foreground">
              Pick list
            </h3>
            <span className="text-sm text-muted-foreground">
              {totalItems} items · {packed.size}/{pickList.length} packed
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pickList.map((product) => {
              const done = packed.has(product.key);
              return (
                <li key={product.key}>
                  <button
                    type="button"
                    aria-pressed={done}
                    onClick={() =>
                      setPacked((current) => {
                        const next = new Set(current);
                        if (next.has(product.key)) next.delete(product.key);
                        else next.add(product.key);
                        return next;
                      })
                    }
                    className={cn(
                      'relative flex w-full flex-col gap-2 rounded-2xl border p-2 text-left transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      done ? 'border-success bg-success/10' : 'border-border bg-background hover:border-primary/40',
                    )}
                  >
                    <Photo src={product.imageUrl} alt={product.name} size="tile" />
                    <span className="absolute right-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-lg font-bold tabular-nums text-foreground shadow-sm">×{product.quantity}</span>
                    {done ? (
                      <span className="absolute left-3 top-3 flex size-8 items-center justify-center rounded-full bg-success text-success-foreground">
                        <Check className="size-5" aria-hidden="true" />
                      </span>
                    ) : null}
                    <span className="line-clamp-2 text-sm font-medium leading-tight text-foreground">{product.name}</span>
                    <span className="text-xs text-muted-foreground">Slot {product.slots.join(', ')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {restock.status === 'approved' ? (
            <Button type="button" size="lg" onClick={() => onAdvance('/start-picking')} loading={busy}>
              <PackageCheck className="size-5" aria-hidden="true" />
              Start packing
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={packedAndLeaving} loading={busy}>
              <Truck className="size-5" aria-hidden="true" />
              {packed.size < pickList.length ? `Packed — leave (${pickList.length - packed.size} not ticked)` : 'Packed — leave for the machine'}
            </Button>
          )}
        </section>
      ) : null}

      {restock.status === 'dispatched' ? (
        <Button type="button" size="lg" onClick={() => onAdvance('/mark-in-transit')} loading={busy}>
          <Truck className="size-5" aria-hidden="true" />
          I’m on my way
        </Button>
      ) : null}

      {step === 2 ? (
        <section className="flex flex-col gap-3" aria-labelledby={`load-${restock.taskId}`}>
          <div className="flex flex-col gap-0.5">
            <h3 id={`load-${restock.taskId}`} className="text-base font-semibold text-foreground">
              Load the machine
            </h3>
            <p className="text-sm text-muted-foreground">Slot by slot. If fewer went in, tap − until the number matches.</p>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {[...restock.lines]
              .sort((a, b) => a.slotCode.localeCompare(b.slotCode, undefined, { numeric: true }))
              .map((line) => {
                const value = loaded[line.slotId] ?? line.quantity;
                return (
                  <li key={line.slotId} className="flex flex-col gap-3 py-4">
                    <div className="flex items-center gap-3">
                      <Photo src={line.imageUrl} alt={line.name} size="row" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-primary">Slot {line.slotCode}</span>
                        <span className="block text-base font-medium leading-snug text-foreground">{line.name}</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2">
                      <span className={cn('text-sm', value < line.quantity ? 'font-medium text-warning' : 'text-muted-foreground')}>
                        {value < line.quantity ? `${line.quantity - value} short of ${line.quantity}` : `All ${line.quantity} in`}
                      </span>
                      <Stepper value={value} max={line.quantity} label={`in slot ${line.slotCode}`} onChange={(next) => setLoaded({ ...loaded, [line.slotId]: next })} />
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
