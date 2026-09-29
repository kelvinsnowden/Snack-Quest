'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ALL_HARDWARE_CAPABILITIES, HARDWARE_CAPABILITY_LABELS, type HardwareCapability } from '@/lib/vending/protocol/capabilities';
import type { AdapterOption } from './CreateManufacturerForm';
import { sendJson } from './sendJson';

const selectClass = 'h-11 md:h-10 w-full rounded-md border border-border bg-surface px-3 text-base sm:text-sm';

export interface ModelEditValues {
  name: string;
  adapterKey: string;
  capabilities: string[];
  slotCount: string;
  slotIdFormat: string;
  notes: string;
}

/**
 * Edits a machine model. Capabilities and adapter are the contract it was
 * certified against: changing either revokes a certification, and the
 * form says so before saving.
 */
export function EditModelForm({ modelId, initial, certified, adapters, manufacturerAdapterLabel }: { modelId: string; initial: ModelEditValues; certified: boolean; adapters: AdapterOption[]; manufacturerAdapterLabel: string }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [capabilities, setCapabilities] = useState<Set<string>>(new Set(initial.capabilities));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const contractChanged = values.adapterKey !== initial.adapterKey || [...capabilities].sort().join() !== [...initial.capabilities].sort().join();

  function toggle(capability: HardwareCapability) {
    setResult(null);
    setCapabilities((current) => {
      const next = new Set(current);
      if (next.has(capability)) next.delete(capability);
      else next.add(capability);
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const slotCount = values.slotCount.trim() === '' ? null : Number(values.slotCount);
    if (slotCount !== null && (!Number.isInteger(slotCount) || slotCount < 1)) {
      setError('Slot count must be a whole number, 1 or more.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await sendJson<{ certificationRevoked: boolean }>(`/api/vending/integrations/models/${encodeURIComponent(modelId)}`, 'PATCH', {
        name: values.name.trim(),
        adapterKey: values.adapterKey || null,
        declaredCapabilities: Array.from(capabilities),
        slotCount,
        slotIdFormat: values.slotIdFormat.trim() || null,
        notes: values.notes.trim() || null,
      });
      setResult(response.certificationRevoked ? 'Saved. Its certification was revoked; re-certify it against the new contract.' : 'Saved.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset disabled={busy} className="grid gap-4 md:grid-cols-4">
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor={`model-name-${modelId}`}>Name</Label>
          <Input id={`model-name-${modelId}`} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required />
        </div>
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor={`model-adapter-${modelId}`}>Adapter</Label>
          <select id={`model-adapter-${modelId}`} value={values.adapterKey} onChange={(event) => setValues({ ...values, adapterKey: event.target.value })} className={selectClass}>
            <option value="">The manufacturer’s ({manufacturerAdapterLabel})</option>
            {adapters.map((adapter) => (
              <option key={adapter.key} value={adapter.key}>
                {adapter.label} ({adapter.maturity})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`model-slots-${modelId}`}>Slots</Label>
          <Input id={`model-slots-${modelId}`} inputMode="numeric" value={values.slotCount} onChange={(event) => setValues({ ...values, slotCount: event.target.value })} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`model-format-${modelId}`}>Slot id format</Label>
          <Input id={`model-format-${modelId}`} value={values.slotIdFormat} onChange={(event) => setValues({ ...values, slotIdFormat: event.target.value })} placeholder="e.g. A1–F8" />
        </div>
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor={`model-notes-${modelId}`}>Notes</Label>
          <Input id={`model-notes-${modelId}`} value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} />
        </div>
        <fieldset className="md:col-span-4">
          <legend className="mb-2 text-sm font-medium text-foreground">What its hardware can do</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_HARDWARE_CAPABILITIES.map((capability) => (
              <label key={capability} className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={capabilities.has(capability)} onChange={() => toggle(capability)} className="size-4 rounded border-border" />
                {HARDWARE_CAPABILITY_LABELS[capability]}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>
      {certified && contractChanged ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This model is certified. Saving a change to its capabilities or adapter revokes the certification; no machine of this model can then be activated for production until it’s certified again.
        </p>
      ) : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {result ? (
        <p role="status" className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {result}
        </p>
      ) : null}
      <div>
        <Button type="submit" size="sm" loading={busy} disabled={!values.name.trim()} variant={certified && contractChanged ? 'danger' : 'primary'}>
          {certified && contractChanged ? 'Save and revoke certification' : 'Save model'}
        </Button>
      </div>
    </form>
  );
}
