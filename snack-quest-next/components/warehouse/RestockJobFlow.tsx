'use client';

import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ProductPhoto as Photo } from '@/components/warehouse/ProductPhoto';

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
 * One machine's restock on the technician's phone. Packing and setting
 * off happen for the whole round at once (`TripPackCard`), so before
 * the rider arrives this only says what this machine gets. At the
 * machine it is the load list: slot by slot in the machine's order,
 * photo beside the slot code, a big − / + defaulted to what was packed.
 * Fewer in, and the note asks why. Finishing records what went in,
 * which adds the stock and closes the job.
 */
export function RestockJobFlow({
  restock,
  loaded,
  setLoaded,
}: {
  restock: RestockJobData;
  loaded: Record<string, number>;
  setLoaded: (next: Record<string, number>) => void;
}) {
  const step = stepOf(restock.status);
  const totalItems = restock.lines.reduce((sum, line) => sum + line.quantity, 0);
  const products = new Map<string, { name: string; imageUrl: string | null }>();
  for (const line of restock.lines) products.set(line.productId ?? line.slotId, { name: line.name, imageUrl: line.imageUrl });

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

      {restock.status === 'draft' ? <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">Waiting for the office to approve this restock. It joins your trip list once they do.</p> : null}

      {step < 2 && restock.status !== 'draft' ? (
        <div className="flex flex-col gap-3 rounded-xl bg-background p-3">
          <p className="text-sm text-foreground">
            <span className="font-medium">{totalItems} items</span>
            <span className="text-muted-foreground">
              {' '}
              for {restock.lines.length} slot{restock.lines.length === 1 ? '' : 's'} — {step === 0 ? 'packed from the trip list above.' : 'on their way with you.'}
            </span>
          </p>
          <ul className="flex flex-wrap gap-2" aria-label="Products for this machine">
            {[...products.entries()].map(([key, product]) => (
              <li key={key}>
                <Photo src={product.imageUrl} alt={product.name} size="thumb" />
              </li>
            ))}
          </ul>
        </div>
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
