'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * One restock task that tops every slot up to capacity — how a new
 * machine gets its first load, and how a machine is filled after a long
 * break. It goes through the same staged restock (approve → pick →
 * dispatch → receive) as any other, so the stock ledger stays whole.
 */
export function FillMachineButton({ machineId, items }: { machineId: string; items: { slotId: string; productId: string; quantityNeeded: number }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fill() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/vending/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId, items, note: 'Fill to capacity' }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Could not create the restock (HTTP ${response.status}).`);
      }
      router.push(`/admin/vending/${machineId}#restock`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the restock.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={fill} loading={busy}>
        <PackagePlus className="size-4" aria-hidden="true" />
        Fill this machine
      </Button>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
