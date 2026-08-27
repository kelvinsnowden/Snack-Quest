'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface CostableOrder {
  id: string;
  orderRef: string;
  customerName: string;
  boxSummary: string;
  placed: string;
  revenueKes: number;
  recordedCostKes: number | null;
}

/**
 * Recording what a run of orders cost, after they are all delivered
 * (§ fulfilment records the real cost).
 *
 * The per-order box lives on the warehouse queue, and a delivered
 * order has left it — so the moment the job finished was the moment
 * the cost could no longer be entered. This is the way back, and it
 * takes several at once because that is how the spending actually
 * happens: one Bolt, one shopping trip, five boxes.
 *
 * **The allocation choice is the point of the screen.** Selecting five
 * orders and typing 800 means either eight hundred each or eight
 * hundred between them, and those differ by a factor of five in every
 * margin figure downstream. So it is an explicit choice, and the
 * resulting per-order figure is shown before anything is saved.
 */
export function BulkOrderCostsForm({ orders }: { orders: CostableOrder[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [goods, setGoods] = useState('');
  const [other, setOther] = useState('');
  const [allocation, setAllocation] = useState<'split' | 'each'>('split');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const goodsKes = Number.parseInt(goods, 10) || 0;
  const otherKes = Number.parseInt(other, 10) || 0;
  const enteredKes = goodsKes + otherKes;
  const count = selected.size;

  const preview = useMemo(() => {
    if (count === 0 || enteredKes === 0) return null;
    const totalSpent = allocation === 'split' ? enteredKes : enteredKes * count;
    const perOrder = allocation === 'split' ? Math.floor(enteredKes / count) : enteredKes;
    const revenue = orders
      .filter((order) => selected.has(order.id))
      .reduce((sum, order) => sum + order.revenueKes, 0);
    return { totalSpent, perOrder, revenue, margin: revenue - totalSpent };
  }, [allocation, count, enteredKes, orders, selected]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    setSaved(null);
    try {
      const response = await fetch('/api/admin/orders/costs/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderIds: [...selected],
          goodsCostKes: goods || 0,
          otherCostKes: other || 0,
          allocation,
          note: note.trim() || null,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? 'Could not save these costs.');
      }
      setSaved(`Saved against ${count} ${count === 1 ? 'order' : 'orders'}.`);
      setSelected(new Set());
      setGoods('');
      setOther('');
      setNote('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save these costs.');
    } finally {
      setSubmitting(false);
    }
  }

  if (orders.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground text-sm">
          No delivered orders yet. Once a box reaches a customer it appears here for its cost to be
          recorded.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden p-0">
        <ul className="divide-border divide-y">
          {orders.map((order) => (
            <li key={order.id}>
              <label className="hover:bg-border/20 flex cursor-pointer items-start gap-3 p-3">
                <input
                  type="checkbox"
                  checked={selected.has(order.id)}
                  onChange={() => toggle(order.id)}
                  className="accent-primary mt-1 size-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-foreground font-medium tabular-nums">{order.orderRef}</span>
                    <span className="text-muted-foreground text-caption tabular-nums">
                      {order.placed}
                    </span>
                  </span>
                  <span className="text-muted-foreground block text-sm">
                    {order.customerName} · {order.boxSummary}
                  </span>
                  <span className="mt-0.5 block text-caption tabular-nums">
                    <span className="text-muted-foreground">
                      KES {order.revenueKes.toLocaleString()}
                    </span>
                    {/*
                      An order that already has a cost is not hidden —
                      it may be the one being corrected — but it says
                      so, because saving over it replaces the figure
                      rather than adding to it.
                    */}
                    {order.recordedCostKes !== null ? (
                      <span className="text-success ml-2">
                        cost KES {order.recordedCostKes.toLocaleString()} recorded
                      </span>
                    ) : (
                      <span className="text-warning ml-2">no cost recorded</span>
                    )}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <p className="text-foreground text-sm font-medium">
          {count === 0
            ? 'Select the orders this spending covers'
            : `${count} ${count === 1 ? 'order' : 'orders'} selected`}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-goods">Snacks cost</Label>
            <Input
              id="bulk-goods"
              inputMode="numeric"
              value={goods}
              onChange={(event) => setGoods(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-other">Everything else</Label>
            <Input
              id="bulk-other"
              inputMode="numeric"
              value={other}
              onChange={(event) => setOther(event.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
            />
          </div>
        </div>

        {/*
          The question the whole screen turns on. Said in money rather
          than in jargon, because "split" and "each" are only obvious
          once you already know which one you meant.
        */}
        <div className="flex flex-col gap-2">
          <Label>Is that the total, or the cost of each order?</Label>
          <div className="flex flex-col gap-1.5 sm:flex-row">
            {(
              [
                ['split', 'Total for all of them', 'Divided evenly across the orders selected.'],
                ['each', 'That much per order', 'The same amount recorded against every one.'],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={cn(
                  'flex flex-1 cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors',
                  allocation === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-surface hover:bg-border/30',
                )}
              >
                <input
                  type="radio"
                  name="allocation"
                  checked={allocation === value}
                  onChange={() => setAllocation(value)}
                  className="accent-primary mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="text-foreground block text-sm font-medium">{label}</span>
                  <span className="text-muted-foreground mt-0.5 block text-caption">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bulk-note">Note (optional)</Label>
          <Input
            id="bulk-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Saturday Kilimani run"
          />
        </div>

        {/* What is about to be written, in money, before it is written. */}
        {preview ? (
          <p className="text-muted-foreground text-sm tabular-nums">
            KES {preview.totalSpent.toLocaleString()} across {count}{' '}
            {count === 1 ? 'order' : 'orders'} — about KES {preview.perOrder.toLocaleString()} each,
            against KES {preview.revenue.toLocaleString()} of revenue.{' '}
            <span
              className={
                preview.margin < 0 ? 'text-danger font-semibold' : 'text-foreground font-medium'
              }
            >
              {preview.margin < 0 ? '-' : ''}KES {Math.abs(preview.margin).toLocaleString()}{' '}
              {preview.margin < 0 ? 'loss' : 'margin'}
            </span>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={onSubmit}
            disabled={count === 0 || enteredKes === 0 || submitting}
            loading={submitting}
          >
            Save costs
          </Button>
          {saved && !error ? <span className="text-success text-sm">{saved}</span> : null}
        </div>
        {error ? <p className="text-danger text-sm">{error}</p> : null}
      </Card>
    </div>
  );
}
