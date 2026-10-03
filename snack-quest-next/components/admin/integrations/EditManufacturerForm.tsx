'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { AdapterOption } from './CreateManufacturerForm';
import { sendJson } from './sendJson';

const selectClass = 'h-11 md:h-10 w-full rounded-md border border-border bg-surface px-3 text-base sm:text-sm';
const orNull = (value: string) => (value.trim() ? value.trim() : null);

export interface ManufacturerEditValues {
  name: string;
  integrationType: string;
  defaultAdapterKey: string;
  apiVersion: string;
  documentationUrl: string;
  supportContact: string;
  notes: string;
}

/** Edits a manufacturer's details. The adapter list only offers adapters that can speak the chosen integration type; machines keep their own adapter until reconfigured. */
export function EditManufacturerForm({ manufacturerId, initial, adapters, integrationTypes }: { manufacturerId: string; initial: ManufacturerEditValues; adapters: AdapterOption[]; integrationTypes: readonly string[] }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const compatible = adapters.filter((adapter) => adapter.integrationTypes.includes(values.integrationType));
  const adapterKey = compatible.some((adapter) => adapter.key === values.defaultAdapterKey) ? values.defaultAdapterKey : (compatible[0]?.key ?? '');
  const set = (key: keyof ManufacturerEditValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setValues((current) => ({ ...current, [key]: event.target.value }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendJson(`/api/vending/integrations/manufacturers/${encodeURIComponent(manufacturerId)}`, 'PATCH', {
        name: values.name.trim(),
        integrationType: values.integrationType,
        defaultAdapterKey: adapterKey,
        apiVersion: orNull(values.apiVersion),
        documentationUrl: orNull(values.documentationUrl),
        supportContact: orNull(values.supportContact),
        notes: orNull(values.notes),
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="mf-name">Name</Label>
          <Input id="mf-name" value={values.name} onChange={set('name')} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mf-type">How we connect</Label>
          <select id="mf-type" value={values.integrationType} onChange={set('integrationType')} className={selectClass}>
            {integrationTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mf-adapter">Adapter for new machines</Label>
          <select id="mf-adapter" value={adapterKey} onChange={set('defaultAdapterKey')} className={selectClass}>
            {compatible.map((adapter) => (
              <option key={adapter.key} value={adapter.key}>
                {adapter.label} ({adapter.maturity})
              </option>
            ))}
          </select>
          {compatible.length === 0 ? <p className="text-xs text-danger">No adapter speaks this kind of connection yet.</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mf-version">Contract version</Label>
          <Input id="mf-version" value={values.apiVersion} onChange={set('apiVersion')} placeholder="e.g. v2" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mf-docs">Documentation address</Label>
          <Input id="mf-docs" type="url" value={values.documentationUrl} onChange={set('documentationUrl')} placeholder="https://" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mf-contact">Support contact</Label>
          <Input id="mf-contact" value={values.supportContact} onChange={set('supportContact')} />
        </div>
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="mf-notes">Notes</Label>
          <Textarea id="mf-notes" value={values.notes} onChange={set('notes')} rows={3} />
        </div>
      </fieldset>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {saved ? (
        <p role="status" className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Saved.
        </p>
      ) : null}
      <div>
        <Button type="submit" size="sm" loading={busy} disabled={!values.name.trim() || !adapterKey}>
          Save manufacturer
        </Button>
      </div>
    </form>
  );
}
