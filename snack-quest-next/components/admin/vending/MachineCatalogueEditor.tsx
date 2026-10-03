'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PriceHistoryLine } from '@/lib/vending/priceHistory';

export interface CatalogueRow {
  productCatalogue: 'snackItem' | 'package';
  productId: string;
  name: string;
  assorted: boolean;
  visible: boolean;
  slotCode: string | null;
  priceOverrideKes: number | null;
}

type Result = { ok: boolean; text: string } | null;
const keyOf = (catalogue: string, id: string) => `${catalogue}:${id}`;
const when = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

async function send(url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new Error((data?.message as string) ?? (data?.error as string) ?? `Couldn't save (HTTP ${response.status}).`);
  return data ?? {};
}

function PriceHistoryPanel({ machineId, productId, onClose }: { machineId: string; productId: string; onClose: () => void }) {
  const [lines, setLines] = useState<PriceHistoryLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vending/machines/${machineId}/price-history?productId=${encodeURIComponent(productId)}`)
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as { history?: PriceHistoryLine[]; error?: string } | null;
        if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
        if (!cancelled) setLines(data?.history ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load the history.");
      });
    return () => {
      cancelled = true;
    };
  }, [machineId, productId]);
  const kes = (value: number | null) => (value === null ? '—' : `KES ${value.toLocaleString('en-KE')}`);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Price history</p>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : lines === null ? <p className="text-sm text-muted-foreground">Loading…</p> : lines.length === 0 ? <p className="text-sm text-muted-foreground">No price changes recorded on this machine.</p> : (
        <ul className="flex flex-col gap-1 text-sm">
          {lines.map((line, index) => (
            <li key={index} className="text-muted-foreground">
              <span className="text-foreground">
                {line.kind === 'slot' ? `Slot ${line.slotCode} price` : 'Machine price'}: {line.kind === 'override' && line.toKes === null ? `${kes(line.fromKes)} → removed (slot price applies)` : `${kes(line.fromKes)} → ${kes(line.toKes)}`}
              </span>
              {' · '}
              {line.at ? when.format(new Date(line.at)) : 'time not recorded'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * What one machine sells. Add a product, link it to the slot it's
 * loaded in, give it a machine-only price, hide it from the screen or
 * remove it. A product only sells when it's here, visible, linked to a
 * slot that's switched on and has stock.
 */
export function MachineCatalogueEditor({
  machineId,
  rows,
  slots,
  products,
  otherMachines,
  canManage,
  canPrice,
}: {
  machineId: string;
  rows: CatalogueRow[];
  slots: { slotCode: string; productKey: string; priceKes: number }[];
  products: { productCatalogue: 'snackItem' | 'package'; productId: string; name: string; active: boolean }[];
  otherMachines: { id: string; code: string }[];
  canManage: boolean;
  canPrice: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>({});
  const [copyFrom, setCopyFrom] = useState('');
  const [copyOverrides, setCopyOverrides] = useState(false);
  const carried = rows.filter((row) => row.assorted);
  const removed = rows.filter((row) => !row.assorted);
  const carriedKeys = new Set(carried.map((row) => keyOf(row.productCatalogue, row.productId)));
  const slotByCode = new Map(slots.map((slot) => [slot.slotCode, slot]));

  async function act<T>(key: string, work: () => Promise<T>, success: string | ((value: T) => string)) {
    setBusyKey(key);
    setResult(null);
    try {
      const value = await work();
      setResult({ ok: true, text: typeof success === 'function' ? success(value) : success });
      router.refresh();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "Couldn't save." });
    } finally {
      setBusyKey(null);
    }
  }

  const patch = (row: CatalogueRow, body: Record<string, unknown>) => send(`/api/vending/machines/${machineId}/assortment/${row.productCatalogue}/${encodeURIComponent(row.productId)}`, 'PATCH', body);

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-64 flex-1 flex-col gap-1.5">
            <Label htmlFor="add-product">Add a product</Label>
            <select id="add-product" value={adding} onChange={(event) => setAdding(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
              <option value="">Choose…</option>
              {products.filter((product) => product.active && !carriedKeys.has(keyOf(product.productCatalogue, product.productId))).map((product) => (
                <option key={keyOf(product.productCatalogue, product.productId)} value={keyOf(product.productCatalogue, product.productId)}>{product.name}</option>
              ))}
            </select>
          </div>
          <Button
            disabled={!adding || busyKey !== null}
            loading={busyKey === 'add'}
            onClick={() => {
              const [productCatalogue, productId] = adding.split(':');
              void act('add', () => send(`/api/vending/machines/${machineId}/assortment`, 'POST', { productCatalogue, productId }), 'Added. Link it to a slot so it can sell.').then(() => setAdding(''));
            }}
          >
            Add
          </Button>
        </div>
      ) : null}

      {result ? (
        <p role={result.ok ? 'status' : 'alert'} className={`flex items-start gap-2 text-sm ${result.ok ? 'text-success' : 'text-danger'}`}>
          {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {result.text}
        </p>
      ) : null}

      {carried.length === 0 ? <p className="text-sm text-muted-foreground">This machine doesn’t carry anything yet.</p> : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {carried.map((row) => {
            const key = keyOf(row.productCatalogue, row.productId);
            const linked = row.slotCode ? slotByCode.get(row.slotCode) : null;
            const draft = overrideDraft[key] ?? (row.priceOverrideKes === null ? '' : String(row.priceOverrideKes));
            const slotsForProduct = slots.filter((slot) => slot.productKey === key);
            const problems = [!row.slotCode ? 'not linked to a slot' : null, row.slotCode && linked && linked.productKey !== key ? `slot ${row.slotCode} holds a different product` : null, !row.visible ? 'hidden from the screen' : null].filter(Boolean);
            return (
              <li key={key} className="flex flex-col gap-3 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <Link href={`/admin/vending/products/${row.productCatalogue}/${encodeURIComponent(row.productId)}`} className="font-medium text-foreground hover:underline">{row.name}</Link>
                    <span className="text-sm text-muted-foreground">
                      {row.priceOverrideKes !== null ? `KES ${row.priceOverrideKes.toLocaleString('en-KE')} on this machine` : linked ? `KES ${linked.priceKes.toLocaleString('en-KE')} (slot price)` : 'No price until linked to a slot'}
                    </span>
                    {problems.length > 0 ? <span className="flex flex-wrap gap-1">{problems.map((problem) => <Badge key={problem} variant="warning">{problem}</Badge>)}</span> : <Badge variant="success">Can sell</Badge>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setHistoryFor(historyFor === key ? null : key)}>
                    <History className="size-4" aria-hidden="true" />
                    Price history
                  </Button>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`slot-${key}`}>Slot</Label>
                    <select
                      id={`slot-${key}`}
                      value={row.slotCode ?? ''}
                      disabled={!canManage || busyKey !== null}
                      onChange={(event) => void act(key, () => patch(row, { slotCode: event.target.value || null }), event.target.value ? `Linked to ${event.target.value}.` : 'Unlinked.')}
                      className="h-10 rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60"
                    >
                      <option value="">Not linked</option>
                      {(slotsForProduct.length > 0 ? slotsForProduct : slots).map((slot) => <option key={slot.slotCode} value={slot.slotCode}>{slot.slotCode}{slot.productKey === key ? '' : slot.productKey ? ' (different product)' : ' (empty)'}</option>)}
                      {row.slotCode && !slotsForProduct.some((slot) => slot.slotCode === row.slotCode) && !slots.some((slot) => slot.slotCode === row.slotCode) ? <option value={row.slotCode}>{row.slotCode}</option> : null}
                    </select>
                  </div>
                  {canPrice ? (
                    <div className="flex items-end gap-2">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`price-${key}`}>Machine price (KES)</Label>
                        <Input id={`price-${key}`} inputMode="numeric" value={draft} placeholder="Slot price" onChange={(event) => setOverrideDraft({ ...overrideDraft, [key]: event.target.value })} className="w-32" />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyKey !== null || (draft.trim() !== '' && !/^\d+$/.test(draft.trim())) || draft.trim() === (row.priceOverrideKes === null ? '' : String(row.priceOverrideKes))}
                        loading={busyKey === `${key}:price`}
                        onClick={() => void act(`${key}:price`, () => patch(row, { priceOverrideKes: draft.trim() === '' ? null : Number(draft) }), draft.trim() === '' ? 'Machine price removed; the slot price applies.' : `Price set to KES ${Number(draft).toLocaleString('en-KE')}.`)}
                      >
                        {row.priceOverrideKes !== null && draft.trim() !== '' ? `KES ${row.priceOverrideKes} → ${draft}` : 'Save price'}
                      </Button>
                    </div>
                  ) : null}
                  {canManage ? (
                    <>
                      <Button size="sm" variant="outline" disabled={busyKey !== null} onClick={() => void act(key, () => patch(row, { visible: !row.visible }), row.visible ? 'Hidden from the screen.' : 'Shown on the screen.')}>{row.visible ? 'Hide' : 'Show'}</Button>
                      <Button size="sm" variant="ghost" disabled={busyKey !== null} onClick={() => void act(key, () => patch(row, { unassort: true }), `${row.name} removed from this machine.`)}>Remove</Button>
                    </>
                  ) : null}
                </div>
                {historyFor === key ? <PriceHistoryPanel machineId={machineId} productId={row.productId} onClose={() => setHistoryFor(null)} /> : null}
              </li>
            );
          })}
        </ul>
      )}

      {removed.length > 0 && canManage ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Removed from this machine ({removed.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {removed.map((row) => (
              <li key={keyOf(row.productCatalogue, row.productId)} className="flex items-center justify-between gap-2">
                <span className="text-foreground">{row.name}</span>
                <Button size="sm" variant="outline" disabled={busyKey !== null} onClick={() => void act(keyOf(row.productCatalogue, row.productId), () => send(`/api/vending/machines/${machineId}/assortment`, 'POST', { productCatalogue: row.productCatalogue, productId: row.productId }), `${row.name} added back.`)}>Add back</Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {canManage && otherMachines.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="copy-range">Copy range from</Label>
            <select id="copy-range" value={copyFrom} onChange={(event) => setCopyFrom(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
              <option value="">Choose a machine…</option>
              {otherMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.code}</option>)}
            </select>
          </div>
          {canPrice ? (
            <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
              <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={copyOverrides} onChange={(event) => setCopyOverrides(event.target.checked)} />
              Copy its machine prices too
            </label>
          ) : null}
          <Button
            variant="outline"
            disabled={!copyFrom || busyKey !== null}
            loading={busyKey === 'copy'}
            onClick={() =>
              void act(
                'copy',
                () => send(`/api/vending/machines/${machineId}/assortment/copy`, 'POST', { fromMachineId: copyFrom, includePriceOverrides: copyOverrides }),
                (data) => `Added ${data.added as number} product${data.added === 1 ? '' : 's'} (${data.alreadyCarried as number} already here). Link the new ones to slots so they can sell.`,
              ).then(() => setCopyFrom(''))
            }
          >
            Copy range
          </Button>
        </div>
      ) : null}
    </div>
  );
}
