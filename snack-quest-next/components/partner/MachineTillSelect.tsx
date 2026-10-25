'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Which of the owner's tills one machine is paid into. Saves on change. */
export function MachineTillSelect({ machineId, machineCode, value, tills }: { machineId: string; machineCode: string; value: string | null; tills: { id: string; label: string }[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(value ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: string) {
    const previous = selected;
    setSelected(next);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/vending/partners/me/machine-tills', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ machineId, accountId: next || null }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setSelected(previous);
        setError(data.error ?? 'Couldn’t save. Try again.');
        return;
      }
      router.refresh();
    } catch {
      setSelected(previous);
      setError('Couldn’t reach Snack Quest. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={`Where ${machineCode}’s sales are paid`}
        className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground disabled:opacity-60 sm:w-56"
        value={selected}
        disabled={busy}
        onChange={(event) => choose(event.target.value)}
      >
        <option value="">Snack Quest’s paybill</option>
        {tills.map((till) => (
          <option key={till.id} value={till.id}>
            {till.label}
          </option>
        ))}
      </select>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
