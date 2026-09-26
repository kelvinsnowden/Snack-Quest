'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SerializedRestockTask } from '@/lib/vending/serialize';

/**
 * The one next action a restock task's own stage actually offers
 * (§ RESTOCKING, docs/INVENTORY_ARCHITECTURE.md §5) — never every
 * button at once. `dispatch`/`receive` need a real per-item quantity
 * from the person doing it, defaulted to what the task already
 * expects but never submitted without the operator seeing and
 * confirming it.
 */
export function RestockTaskActions({ taskId, task }: { taskId: string; task: SerializedRestockTask }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, string>>(
    Object.fromEntries(task.items.map((item) => [item.slotId, String(item.quantityNeeded)])),
  );
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>(
    Object.fromEntries(task.items.map((item) => [item.slotId, String(item.quantityDispatched ?? 0)])),
  );

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/restock/${taskId}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Action failed (HTTP ${response.status}).`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  const control = (() => {
    switch (task.status) {
      case 'draft':
        return <Button size="sm" variant="outline" loading={busy} onClick={() => post('/approve')}>Approve</Button>;
      case 'approved':
        return <Button size="sm" variant="outline" loading={busy} onClick={() => post('/start-picking')}>Start picking</Button>;
      case 'picking':
        return (
          <div className="flex flex-col gap-2">
            {task.items.map((item) => (
              <label key={item.slotId} className="flex items-center gap-2 text-sm">
                <span className="w-16 text-muted-foreground">{item.slotId}</span>
                <input
                  type="number"
                  min={0}
                  value={dispatchQuantities[item.slotId]}
                  onChange={(event) => setDispatchQuantities((prev) => ({ ...prev, [item.slotId]: event.target.value }))}
                  className="h-8 w-24 rounded-md border border-border bg-surface px-2 text-sm text-foreground"
                />
                <span className="text-caption text-muted-foreground">to dispatch (needed {item.quantityNeeded})</span>
              </label>
            ))}
            <Button
              size="sm"
              variant="outline"
              loading={busy}
              onClick={() =>
                post('/dispatch', {
                  items: task.items.map((item) => ({ slotId: item.slotId, quantityDispatched: Number(dispatchQuantities[item.slotId]) })),
                })
              }
            >
              Dispatch
            </Button>
          </div>
        );
      case 'dispatched':
        return <Button size="sm" variant="outline" loading={busy} onClick={() => post('/mark-in-transit')}>Mark in transit</Button>;
      case 'in_transit':
        return (
          <div className="flex flex-col gap-2">
            {task.items.map((item) => (
              <label key={item.slotId} className="flex items-center gap-2 text-sm">
                <span className="w-16 text-muted-foreground">{item.slotId}</span>
                <input
                  type="number"
                  min={0}
                  value={receiveQuantities[item.slotId]}
                  onChange={(event) => setReceiveQuantities((prev) => ({ ...prev, [item.slotId]: event.target.value }))}
                  className="h-8 w-24 rounded-md border border-border bg-surface px-2 text-sm text-foreground"
                />
                <span className="text-caption text-muted-foreground">received (dispatched {item.quantityDispatched ?? 0})</span>
              </label>
            ))}
            <Button
              size="sm"
              variant="outline"
              loading={busy}
              onClick={() =>
                post('/receive', {
                  items: task.items.map((item) => ({ slotId: item.slotId, quantityReceived: Number(receiveQuantities[item.slotId]) })),
                })
              }
            >
              Confirm receipt
            </Button>
          </div>
        );
      default:
        return null;
    }
  })();

  const cancellable = task.status === 'draft' || task.status === 'approved' || task.status === 'picking' || task.status === 'dispatched';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-2">
        {control}
        {cancellable ? (
          <Button size="sm" variant="ghost" loading={busy} onClick={() => post('/cancel')}>
            Cancel
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
