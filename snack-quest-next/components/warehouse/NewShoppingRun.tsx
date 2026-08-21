'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ShoppingBasket } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface PickableOrder {
  id: string;
  label: string;
  packageLabel: string;
  customerName: string;
}

/**
 * Picks the orders a shopping run covers (§ Box Recipes).
 *
 * Whole rows are the tap target, not the checkbox inside them — this is
 * used one-handed, and a 20px checkbox is not something to aim at while
 * standing up. "Select all" is there because the common case is buying
 * for everything currently waiting, and tapping fourteen rows to say so
 * is not a workflow.
 */
export function NewShoppingRun({ orders }: { orders: PickableOrder[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(orderId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === orders.length ? new Set() : new Set(orders.map((order) => order.id))));
  }

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/warehouse/shopping-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: Array.from(selected) }),
      });
      const data = (await response.json().catch(() => ({}))) as { runId?: string; error?: string };
      if (!response.ok || !data.runId) {
        throw new Error(data.error ?? 'Could not build the shopping list.');
      }
      router.push(`/warehouse/shopping/${data.runId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the shopping list.');
    } finally {
      setCreating(false);
    }
  }

  if (orders.length === 0) {
    return null;
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">Start a run</p>
          <p className="text-caption text-muted-foreground">
            {orders.length} order{orders.length === 1 ? '' : 's'} waiting to be packed
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={toggleAll} className="min-h-10">
          {selected.size === orders.length ? 'Clear' : 'Select all'}
        </Button>
      </div>

      {error ? (
        <p className="flex items-start gap-1.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}

      <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {orders.map((order) => {
          const isSelected = selected.has(order.id);
          return (
            <li key={order.id}>
              <button
                type="button"
                onClick={() => toggle(order.id)}
                aria-pressed={isSelected}
                className={`flex min-h-14 w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  isSelected ? 'border-primary bg-primary/10' : 'border-border bg-surface active:bg-border/30'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-5 shrink-0 items-center justify-center rounded border-2 ${
                    isSelected ? 'border-primary bg-primary text-white' : 'border-border'
                  }`}
                >
                  {isSelected ? '✓' : ''}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {order.label} · {order.packageLabel}
                  </span>
                  <span className="truncate text-caption text-muted-foreground">{order.customerName}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Button onClick={create} disabled={selected.size === 0 || creating} loading={creating} className="min-h-12">
        <ShoppingBasket className="size-4" aria-hidden="true" />
        Build list for {selected.size} order{selected.size === 1 ? '' : 's'}
      </Button>
    </Card>
  );
}
