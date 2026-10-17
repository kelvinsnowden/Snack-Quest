'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface MachineRow {
  id: string;
  code: string;
  status: string;
  location: string;
}

interface ProductRow {
  productCatalogue: 'package' | 'snackItem';
  productId: string;
  name: string;
}

interface Result {
  machineId: string;
  machineCode: string;
  outcome: 'done' | 'skipped' | 'failed';
  detail: string;
}

type Kind = 'status' | 'price' | 'add_product' | 'remove_product' | 'copy_range';
const STATUSES = ['active', 'maintenance', 'offline', 'testing', 'installing', 'decommissioned'] as const;
const field = 'h-10 rounded-lg border border-border bg-background px-3 text-sm';

/**
 * Pick machines (filter by status or place, tick, or tick all shown),
 * pick one change, apply. Every machine is changed through the same
 * rules as its own page, and the result lists each one: done, skipped
 * (and why) or failed (and why).
 */
export function BulkMachineEditor({ machines, products, can }: { machines: MachineRow[]; products: ProductRow[]; can: { status: boolean; decommission: boolean; price: boolean; catalogue: boolean } }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const kinds = useMemo(() => {
    const list: [Kind, string][] = [];
    if (can.status) list.push(['status', 'Change status']);
    if (can.price) list.push(['price', 'Set a product’s price']);
    if (can.catalogue) list.push(['add_product', 'Add a product'], ['remove_product', 'Remove a product'], ['copy_range', 'Copy the range of one machine']);
    return list;
  }, [can]);
  const [kind, setKind] = useState<Kind | ''>(kinds[0]?.[0] ?? '');
  const [to, setTo] = useState<string>('maintenance');
  const [product, setProduct] = useState('');
  const [price, setPrice] = useState('');
  const [fromMachine, setFromMachine] = useState('');
  const [withPrices, setWithPrices] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  const locations = useMemo(() => [...new Set(machines.map((machine) => machine.location))].sort(), [machines]);
  const shown = machines.filter((machine) => (!statusFilter || machine.status === statusFilter) && (!locationFilter || machine.location === locationFilter));
  const allShownSelected = shown.length > 0 && shown.every((machine) => selected.has(machine.id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleShown() {
    setSelected((current) => {
      const next = new Set(current);
      for (const machine of shown) {
        if (allShownSelected) next.delete(machine.id);
        else next.add(machine.id);
      }
      return next;
    });
  }

  function action(): Record<string, unknown> | null {
    const [productCatalogue, productId] = product.split(':');
    switch (kind) {
      case 'status':
        return { kind, to };
      case 'price':
        return product ? { kind, productCatalogue, productId, priceKes: price.trim() === '' ? null : Number(price) } : null;
      case 'add_product':
      case 'remove_product':
        return product ? { kind, productCatalogue, productId } : null;
      case 'copy_range':
        return fromMachine ? { kind, fromMachineId: fromMachine, includePriceOverrides: withPrices } : null;
      default:
        return null;
    }
  }

  async function apply() {
    const body = action();
    if (!body) return;
    const label = kinds.find(([key]) => key === kind)?.[1] ?? 'Apply';
    if (!window.confirm(`${label} on ${selected.size} machine${selected.size === 1 ? '' : 's'}?${kind === 'status' && to === 'decommissioned' ? ' Retiring machines can’t be undone.' : ''}`)) return;
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const response = await fetch('/api/vending/machines/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineIds: [...selected], action: body }),
      });
      const data = (await response.json().catch(() => null)) as { results?: Result[]; error?: string; message?: string } | null;
      if (!response.ok || !data?.results) throw new Error(data?.message ?? data?.error ?? `That didn’t apply (HTTP ${response.status}).`);
      setResults(data.results);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t apply.');
    } finally {
      setBusy(false);
    }
  }

  if (kinds.length === 0) return <p className="text-sm text-muted-foreground">You don’t have permission to change machines.</p>;

  const counts = results ? { done: results.filter((r) => r.outcome === 'done').length, skipped: results.filter((r) => r.outcome === 'skipped').length, failed: results.filter((r) => r.outcome === 'failed').length } : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">1. Machines</h2>
        <div className="flex flex-wrap gap-3">
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={field}>
            <option value="">Any status</option>
            {[...new Set(machines.map((machine) => machine.status))].sort().map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select aria-label="Filter by place" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className={field}>
            <option value="">Any place</option>
            {locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
          <span className="self-center text-sm text-muted-foreground">{selected.size} chosen</span>
        </div>
        <div className="max-h-80 overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="w-10 px-3 py-2">
                  <Checkbox aria-label="Choose all shown" checked={allShownSelected} onCheckedChange={toggleShown} />
                </th>
                <th className="px-3 py-2 font-medium">Machine</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Place</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((machine) => (
                <tr key={machine.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <Checkbox aria-label={`Choose ${machine.code}`} checked={selected.has(machine.id)} onCheckedChange={() => toggle(machine.id)} />
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">{machine.code}</td>
                  <td className="px-3 py-2 text-muted-foreground">{machine.status}</td>
                  <td className="px-3 py-2 text-muted-foreground">{machine.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">2. Change</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-kind">What to change</Label>
            <select id="bulk-kind" value={kind} onChange={(event) => setKind(event.target.value as Kind)} className={field}>
              {kinds.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {kind === 'status' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-to">New status</Label>
              <select id="bulk-to" value={to} onChange={(event) => setTo(event.target.value)} className={field}>
                {STATUSES.filter((status) => status !== 'decommissioned' || can.decommission).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {kind === 'price' || kind === 'add_product' || kind === 'remove_product' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-product">Product</Label>
              <select id="bulk-product" value={product} onChange={(event) => setProduct(event.target.value)} className={field}>
                <option value="">Choose…</option>
                {products.map((option) => (
                  <option key={`${option.productCatalogue}:${option.productId}`} value={`${option.productCatalogue}:${option.productId}`}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {kind === 'price' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-price">Price on these machines (KES)</Label>
              <Input id="bulk-price" type="number" min={1} step={1} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Blank = normal price" />
            </div>
          ) : null}
          {kind === 'copy_range' ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bulk-from">Copy from</Label>
                <select id="bulk-from" value={fromMachine} onChange={(event) => setFromMachine(event.target.value)} className={field}>
                  <option value="">Choose…</option>
                  {machines.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machine.code}
                    </option>
                  ))}
                </select>
              </div>
              {can.price ? (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={withPrices} onCheckedChange={(checked) => setWithPrices(checked === true)} />
                  Copy its special prices too
                </label>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div>
        <Button type="button" onClick={apply} loading={busy} disabled={selected.size === 0 || !action()}>
          Apply to {selected.size} machine{selected.size === 1 ? '' : 's'}
        </Button>
      </div>

      {results && counts ? (
        <section className="flex flex-col gap-2" aria-live="polite">
          <h2 className="text-sm font-semibold text-foreground">
            Done {counts.done} · skipped {counts.skipped} · failed {counts.failed}
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {results.map((result) => (
              <li key={result.machineId} className="flex flex-wrap items-center gap-2">
                <Badge variant={result.outcome === 'done' ? 'success' : result.outcome === 'skipped' ? 'outline' : 'danger'}>{result.outcome}</Badge>
                <span className="font-medium text-foreground">{result.machineCode}</span>
                <span className="text-muted-foreground">{result.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
