'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendJson } from './sendJson';

export interface AdapterOption {
  key: string;
  label: string;
  integrationTypes: readonly string[];
  maturity: string;
}

const INTEGRATION_TYPE_LABELS: Record<string, string> = {
  snack_quest_api: 'They integrate with our Machine API',
  manufacturer_api: 'We call their API',
  sdk: 'We embed their SDK',
  webhook: 'They send us webhooks',
  hybrid: 'Hybrid (API + webhooks)',
};

const selectClass = 'h-11 md:h-10 w-full rounded-md border border-border bg-surface px-3 text-base sm:text-sm';

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

/** Registers a new manufacturer at the Application stage. The adapter list only offers adapters that can speak the chosen integration type. */
export function CreateManufacturerForm({ adapters, integrationTypes }: { adapters: AdapterOption[]; integrationTypes: readonly string[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [integrationType, setIntegrationType] = useState(integrationTypes[0] ?? 'snack_quest_api');
  const compatible = adapters.filter((adapter) => adapter.integrationTypes.includes(integrationType));
  const [adapterKey, setAdapterKey] = useState(compatible[0]?.key ?? '');
  const [documentationUrl, setDocumentationUrl] = useState('');
  const [supportContact, setSupportContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveAdapter = compatible.some((adapter) => adapter.key === adapterKey) ? adapterKey : (compatible[0]?.key ?? '');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await sendJson<{ id: string }>('/api/vending/integrations/manufacturers', 'POST', {
        name,
        slug,
        integrationType,
        defaultAdapterKey: effectiveAdapter,
        documentationUrl: documentationUrl || null,
        supportContact: supportContact || null,
      });
      router.push(`/admin/vending/integrations/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the manufacturer.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="mfr-name">Name</Label>
        <Input
          id="mfr-name"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugTouched) setSlug(slugify(event.target.value));
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mfr-slug">Slug</Label>
        <Input id="mfr-slug" required value={slug} onChange={(event) => { setSlug(event.target.value); setSlugTouched(true); }} />
        <p className="text-caption text-muted-foreground">Used in their webhook URL. Lowercase letters, digits and hyphens.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mfr-type">How they connect</Label>
        <select id="mfr-type" className={selectClass} value={integrationType} onChange={(event) => setIntegrationType(event.target.value)}>
          {integrationTypes.map((type) => (
            <option key={type} value={type}>{INTEGRATION_TYPE_LABELS[type] ?? type}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mfr-adapter">Adapter</Label>
        <select id="mfr-adapter" className={selectClass} value={effectiveAdapter} onChange={(event) => setAdapterKey(event.target.value)} disabled={compatible.length === 0}>
          {compatible.map((adapter) => (
            <option key={adapter.key} value={adapter.key}>{adapter.label}{adapter.maturity !== 'implemented' ? ` — ${adapter.maturity}` : ''}</option>
          ))}
        </select>
        {compatible.length === 0 ? <p className="text-caption text-danger">No registered adapter supports this integration type yet.</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mfr-docs">Their documentation (optional)</Label>
        <Input id="mfr-docs" type="url" value={documentationUrl} onChange={(event) => setDocumentationUrl(event.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mfr-contact">Technical contact (optional)</Label>
        <Input id="mfr-contact" value={supportContact} onChange={(event) => setSupportContact(event.target.value)} />
      </div>
      <div className="flex items-center gap-3 md:col-span-2">
        <Button type="submit" loading={busy} disabled={!name || !slug || !effectiveAdapter}>Add manufacturer</Button>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      </div>
    </form>
  );
}
