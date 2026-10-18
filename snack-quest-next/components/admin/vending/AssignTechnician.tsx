'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** A select that gives one task to a technician (or nobody). Saves as soon as it changes. */
export function AssignTechnician({
  kind,
  refId,
  current,
  technicians,
  disabled,
}: {
  kind: 'maintenance' | 'restock';
  refId: string;
  current: string | null;
  technicians: { uid: string; name: string }[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/vending/technician-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, refId, assigneeUid: next || null }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? 'Not saved.');
      router.refresh();
    } catch (err) {
      setValue(previous);
      setError(err instanceof Error ? err.message : 'Not saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label="Assign to"
        value={value}
        disabled={disabled || busy}
        onChange={(event) => change(event.target.value)}
        className="h-9 min-w-40 rounded-lg border border-border bg-background px-2 text-sm"
      >
        <option value="">Nobody yet</option>
        {technicians.map((technician) => (
          <option key={technician.uid} value={technician.uid}>
            {technician.name}
          </option>
        ))}
      </select>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
