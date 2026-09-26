'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackagePlus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * § PART 3 — RESTOCK COMMAND CENTER. One click, one item — the exact
 * same `POST /api/vending/restock` contract the per-machine restock
 * card already uses, never a second task-creation path. Once created,
 * the rest of the workflow (approve/pick/dispatch/transit/receive)
 * happens on the machine's own detail page, which is where a
 * multi-step operational task belongs.
 */
export function CreateRestockTaskButton({ machineId, slotId, recommendedQuantity }: { machineId: string; slotId: string; recommendedQuantity: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createTask() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/vending/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId, items: [{ slotId, quantityNeeded: recommendedQuantity }] }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Could not create the task (HTTP ${response.status}).`);
      }
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the task.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-success">
        <Check className="size-3.5" aria-hidden="true" />
        Task created
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={createTask} loading={busy}>
        <PackagePlus className="size-3.5" aria-hidden="true" />
        Create task
      </Button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
