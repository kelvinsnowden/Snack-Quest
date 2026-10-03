'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ALL_HARDWARE_CAPABILITIES, HARDWARE_CAPABILITY_LABELS, type HardwareCapability } from '@/lib/vending/protocol/capabilities';
import { sendJson } from './sendJson';

/** Adds a machine model with what its hardware physically has. What a machine can actually do is this ∩ its adapter's reach. */
export function CreateModelForm({ manufacturerId }: { manufacturerId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slotCount, setSlotCount] = useState('');
  const [slotIdFormat, setSlotIdFormat] = useState('');
  const [capabilities, setCapabilities] = useState<Set<HardwareCapability>>(new Set(['vend', 'dispense_confirmation', 'heartbeat', 'telemetry', 'faults']));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(capability: HardwareCapability) {
    setCapabilities((current) => {
      const next = new Set(current);
      if (next.has(capability)) next.delete(capability);
      else next.add(capability);
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendJson('/api/vending/integrations/models', 'POST', {
        manufacturerId,
        name,
        slug,
        declaredCapabilities: Array.from(capabilities),
        slotCount: slotCount ? Number(slotCount) : null,
        slotIdFormat: slotIdFormat || null,
      });
      setName('');
      setSlug('');
      setSlotCount('');
      setSlotIdFormat('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the model.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="model-name">Model name</Label>
          <Input id="model-name" required value={name} onChange={(event) => { setName(event.target.value); setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')); }} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="model-slug">Slug</Label>
          <Input id="model-slug" required value={slug} onChange={(event) => setSlug(event.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="model-slots">Slots</Label>
          <Input id="model-slots" type="number" min={1} value={slotCount} onChange={(event) => setSlotCount(event.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="model-slot-format">Their slot naming</Label>
          <Input id="model-slot-format" placeholder="e.g. spiral_01…spiral_40" value={slotIdFormat} onChange={(event) => setSlotIdFormat(event.target.value)} />
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">What the hardware has</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {ALL_HARDWARE_CAPABILITIES.map((capability) => (
            <label key={capability} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={capabilities.has(capability)} onChange={() => toggle(capability)} />
              {HARDWARE_CAPABILITY_LABELS[capability]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" loading={busy} disabled={!name || !slug}>Add model</Button>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      </div>
    </form>
  );
}
