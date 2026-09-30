'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Option = { id: string; name: string };
const selectClass = 'min-h-10 w-full rounded-md border border-border bg-surface px-2 text-sm';

/** Opens the builder for a new owner, location or machine design. Nothing is saved until the first draft. */
export function KioskLayerPicker({ owners, locations, machines }: { owners: Option[]; locations: Option[]; machines: Option[] }) {
  const router = useRouter();
  const [scope, setScope] = useState<'owner' | 'location' | 'machine'>('machine');
  const options = { owner: owners, location: locations, machine: machines }[scope];
  const [target, setTarget] = useState('');
  const chosen = options.some((option) => option.id === target) ? target : '';
  return (
    <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">For</span>
        <select className={selectClass} value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
          <option value="owner">An owner’s machines</option>
          <option value="location">A location’s machines</option>
          <option value="machine">One machine</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Which</span>
        <select className={selectClass} value={chosen} onChange={(event) => setTarget(event.target.value)}>
          <option value="">Choose…</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <Button disabled={!chosen} onClick={() => router.push(`/admin/vending/kiosk-design/${scope}/${encodeURIComponent(chosen)}`)}>
        Open designer
      </Button>
    </div>
  );
}
