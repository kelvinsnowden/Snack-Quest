'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, PauseCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface EditorSlot {
  slotCode: string;
  productCatalogue: 'snackItem' | 'package' | null;
  productId: string | null;
  priceKes: number;
  capacity: number;
  currentQuantity: number;
  enabled: boolean;
  position: number;
  manufacturerSlotId: string | null;
  quarantine: { reason: string; transactionId: string | null; since: string | null } | null;
}

export interface EditorProduct {
  productCatalogue: 'snackItem' | 'package';
  productId: string;
  name: string;
  active: boolean;
}

type Result = { ok: boolean; text: string } | null;

const REASON: Record<string, string> = { jam: 'a jam', unknown: 'a vend with an unknown result', sensor_failure: 'a drop-sensor failure' };
const OUTCOME: Record<string, string> = { success: 'OK', failed: 'Failed', timeout: 'Timed out', unknown: 'Unknown', jam: 'Jam', no_product: 'Empty', sensor_failure: 'Sensor', machine_offline: 'Offline' };
const keyOf = (catalogue: string | null, id: string | null) => (id ? `${catalogue}:${id}` : '');

async function send(url: string, method: 'PUT' | 'PATCH' | 'POST', body: Record<string, unknown>): Promise<void> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!response.ok) throw new Error(data?.message ?? data?.error ?? `Couldn't save (HTTP ${response.status}).`);
}

function Message({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <p role={result.ok ? 'status' : 'alert'} className={`flex items-start gap-2 text-sm ${result.ok ? 'text-success' : 'text-danger'}`}>
      {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      {result.text}
    </p>
  );
}

/** Splits `A01` into row `A` so the grid follows the machine's trays; codes without a letter prefix share one row. */
function rowOf(slotCode: string): string {
  const match = /^[A-Za-z]+/.exec(slotCode);
  return match ? match[0].toUpperCase() : '#';
}

/**
 * The slot editor: the machine's slots laid out by tray row, each
 * showing what it sells, its price, stock and recent vends. Choosing a
 * slot opens its settings. Prices need `pricing.manage`; everything else
 * slot setup. A slot paused after a jam comes back only through "Return
 * to sale", with a note of what was found.
 */
export function SlotEditor({
  machineId,
  slots,
  products,
  health,
  otherMachines,
  canConfigure,
  canPrice,
  canToggle,
}: {
  machineId: string;
  slots: EditorSlot[];
  products: EditorProduct[];
  health: Record<string, string[]>;
  otherMachines: { id: string; code: string }[];
  canConfigure: boolean;
  canPrice: boolean;
  canToggle: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [copyFrom, setCopyFrom] = useState('');
  const [copyPrices, setCopyPrices] = useState(false);
  const productName = useMemo(() => new Map(products.map((product) => [keyOf(product.productCatalogue, product.productId), product.name])), [products]);
  const rows = useMemo(() => {
    const grouped = new Map<string, EditorSlot[]>();
    for (const slot of [...slots].sort((a, b) => a.position - b.position || a.slotCode.localeCompare(b.slotCode))) {
      const row = rowOf(slot.slotCode);
      grouped.set(row, [...(grouped.get(row) ?? []), slot]);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);
  const current = slots.find((slot) => slot.slotCode === selected) ?? null;
  const bulk = canPrice || canToggle;

  function togglePick(slotCode: string) {
    const next = new Set(picked);
    if (next.has(slotCode)) next.delete(slotCode);
    else next.add(slotCode);
    setPicked(next);
  }

  async function runBulk(change: { priceKes?: number; enabled?: boolean }) {
    setBusy(true);
    setResult(null);
    const done: string[] = [];
    const skipped: string[] = [];
    try {
      for (const slotCode of [...picked].sort()) {
        const slot = slots.find((entry) => entry.slotCode === slotCode);
        if (change.enabled === true && slot?.quarantine) {
          skipped.push(slotCode);
          continue;
        }
        await send(`/api/vending/machines/${machineId}/slots`, 'PATCH', { slotCode, ...change });
        done.push(slotCode);
      }
      setResult({ ok: true, text: `Updated ${done.join(', ') || 'nothing'}.${skipped.length ? ` Paused, left off: ${skipped.join(', ')}.` : ''}` });
      setPicked(new Set());
      setBulkPrice('');
      router.refresh();
    } catch (error) {
      setResult({ ok: false, text: `${done.length ? `Updated ${done.join(', ')}, then: ` : ''}${error instanceof Error ? error.message : "couldn't save."}` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copyLayout() {
    setBusy(true);
    setResult(null);
    try {
      await send(`/api/vending/machines/${machineId}/slots/copy`, 'POST', { fromMachineId: copyFrom, includePrices: copyPrices });
      setResult({ ok: true, text: 'Layout copied. Stock wasn’t copied — load the slots through a restock.' });
      setCopyFrom('');
      router.refresh();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "Couldn't copy." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {slots.length === 0 ? <p className="text-sm text-muted-foreground">No slots yet. Add them one by one, or copy the layout of a machine of the same model.</p> : null}

      <div className="flex flex-col gap-4">
        {rows.map(([row, rowSlots]) => (
          <div key={row} className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{row === '#' ? 'Slots' : `Row ${row}`}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {rowSlots.map((slot) => {
                const recent = health[slot.slotCode] ?? [];
                const problems = recent.slice(0, 5).filter((status) => status !== 'success').length;
                const state = slot.quarantine ? 'Paused' : slot.enabled ? 'Selling' : 'Off';
                return (
                  <div key={slot.slotCode} className={`relative flex flex-col rounded-lg border p-2 text-left text-sm ${selected === slot.slotCode ? 'border-primary ring-2 ring-primary/30' : slot.quarantine ? 'border-warning' : 'border-border'}`}>
                    {bulk ? (
                      <input type="checkbox" aria-label={`Select ${slot.slotCode}`} className="absolute right-2 top-2 size-4 accent-[var(--color-primary)]" checked={picked.has(slot.slotCode)} onChange={() => togglePick(slot.slotCode)} />
                    ) : null}
                    <button type="button" onClick={() => { setSelected(slot.slotCode); setAdding(false); setResult(null); }} className="flex flex-col gap-1 pr-6 text-left">
                      <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
                        {slot.slotCode}
                        {slot.quarantine ? <PauseCircle className="size-3.5 text-warning" aria-label="Paused" /> : null}
                      </span>
                      <span className="line-clamp-2 min-h-8 text-foreground">{slot.productId ? (productName.get(keyOf(slot.productCatalogue, slot.productId)) ?? slot.productId) : <span className="text-muted-foreground">Empty</span>}</span>
                      <span className="tabular-nums text-muted-foreground">KES {slot.priceKes.toLocaleString('en-KE')} · {slot.currentQuantity}/{slot.capacity}</span>
                      <span className="flex items-center gap-1.5">
                        <Badge variant={state === 'Selling' ? 'success' : state === 'Paused' ? 'warning' : 'outline'}>{state}</Badge>
                        {recent.length > 0 ? <span className={`text-xs ${problems > 0 ? 'text-danger' : 'text-muted-foreground'}`}>{problems > 0 ? `${problems} of last ${Math.min(recent.length, 5)} failed` : 'recent vends OK'}</span> : null}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {picked.size > 0 ? (
        <div className="sticky bottom-0 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3 shadow-sm">
          <p className="text-sm font-medium text-foreground">{picked.size} selected</p>
          {canPrice ? (
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="bulk-price">New price (KES)</Label>
                <Input id="bulk-price" inputMode="numeric" value={bulkPrice} onChange={(event) => setBulkPrice(event.target.value)} className="w-28" />
              </div>
              <Button size="sm" loading={busy} disabled={!/^\d+$/.test(bulkPrice.trim()) || Number(bulkPrice) <= 0} onClick={() => runBulk({ priceKes: Number(bulkPrice) })}>Set price</Button>
            </div>
          ) : null}
          {canToggle ? (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => runBulk({ enabled: false })}>Switch off</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => runBulk({ enabled: true })}>Switch on</Button>
            </>
          ) : null}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPicked(new Set())}>Clear</Button>
        </div>
      ) : null}

      <Message result={result} />

      {current ? <SlotPanel key={current.slotCode} machineId={machineId} slot={current} products={products} history={health[current.slotCode] ?? []} canConfigure={canConfigure} canPrice={canPrice} canToggle={canToggle} onClose={() => setSelected(null)} /> : null}
      {adding ? <SlotPanel key="new" machineId={machineId} slot={null} products={products} history={[]} canConfigure={canConfigure} canPrice={canPrice} canToggle={false} onClose={() => setAdding(false)} existingCodes={slots.map((slot) => slot.slotCode)} nextPosition={Math.max(0, ...slots.map((slot) => slot.position)) + 1} /> : null}

      {canConfigure ? (
        <div className="flex flex-col gap-4 border-t border-border pt-4 lg:flex-row lg:items-end lg:justify-between">
          {canPrice && !adding ? (
            <div>
              <Button variant="outline" onClick={() => { setAdding(true); setSelected(null); }}>Add a slot</Button>
            </div>
          ) : null}
          {otherMachines.length > 0 ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="copy-from">Copy layout from</Label>
                <select id="copy-from" value={copyFrom} onChange={(event) => setCopyFrom(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="">Choose a machine…</option>
                  {otherMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.code}</option>)}
                </select>
              </div>
              {canPrice ? (
                <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
                  <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={copyPrices} onChange={(event) => setCopyPrices(event.target.checked)} />
                  Copy prices too
                </label>
              ) : null}
              <Button variant="outline" loading={busy} disabled={!copyFrom} onClick={copyLayout}>Copy layout</Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SlotPanel({
  machineId,
  slot,
  products,
  history,
  canConfigure,
  canPrice,
  canToggle,
  onClose,
  existingCodes = [],
  nextPosition = 1,
}: {
  machineId: string;
  slot: EditorSlot | null;
  products: EditorProduct[];
  history: string[];
  canConfigure: boolean;
  canPrice: boolean;
  canToggle: boolean;
  onClose: () => void;
  existingCodes?: string[];
  nextPosition?: number;
}) {
  const router = useRouter();
  const [slotCode, setSlotCode] = useState(slot?.slotCode ?? '');
  const [product, setProduct] = useState(keyOf(slot?.productCatalogue ?? null, slot?.productId ?? null));
  const [price, setPrice] = useState(String(slot?.priceKes ?? ''));
  const [capacity, setCapacity] = useState(String(slot?.capacity ?? ''));
  const [position, setPosition] = useState(String(slot?.position ?? nextPosition));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const priceChanges = slot !== null && price.trim() !== '' && Number(price) !== slot.priceKes;
  const codeTaken = slot === null && existingCodes.includes(slotCode.trim());
  const valid = slotCode.trim() !== '' && !codeTaken && /^\d+$/.test(price.trim()) && /^\d+$/.test(capacity.trim()) && /^\d+$/.test(position.trim()) && (product === '' || Number(price) > 0);

  async function save() {
    setBusy(true);
    setResult(null);
    const [productCatalogue, productId] = product ? product.split(':') : [null, null];
    try {
      await send(`/api/vending/machines/${machineId}/slots/${encodeURIComponent(slotCode.trim())}`, 'PUT', {
        productId: productId ?? null,
        productCatalogue: productCatalogue ?? null,
        priceKes: Number(price),
        capacity: Number(capacity),
        position: Number(position),
      });
      setResult({ ok: true, text: slot ? 'Saved.' : `Slot ${slotCode.trim()} added.` });
      router.refresh();
      if (!slot) onClose();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(enabled: boolean) {
    setBusy(true);
    setResult(null);
    try {
      await send(`/api/vending/machines/${machineId}/slots`, 'PATCH', { slotCode: slot!.slotCode, enabled });
      router.refresh();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  async function returnToSale() {
    setBusy(true);
    setResult(null);
    try {
      await send(`/api/vending/machines/${machineId}/slots/${encodeURIComponent(slot!.slotCode)}/return-to-sale`, 'POST', { note });
      setResult({ ok: true, text: 'Back on sale.' });
      setNote('');
      router.refresh();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  const field = 'h-10 rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60';
  return (
    <section aria-label={slot ? `Slot ${slot.slotCode}` : 'New slot'} className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-semibold text-foreground">{slot ? `Slot ${slot.slotCode}` : 'New slot'}</h2>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>

      {slot?.quarantine ? (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3">
          <p className="flex items-start gap-2 text-sm text-foreground">
            <PauseCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              Paused after {REASON[slot.quarantine.reason] ?? slot.quarantine.reason}
              {slot.quarantine.since ? ` on ${new Date(slot.quarantine.since).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}` : ''}. Nobody can buy from it until it’s checked.
              {slot.quarantine.transactionId ? (
                <>
                  {' '}
                  <Link href={`/admin/vending/sales/${slot.quarantine.transactionId}`} className="text-primary hover:underline">See the sale</Link> — the customer may need a refund.
                </>
              ) : null}
            </span>
          </p>
          {canConfigure ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="rts-note">What did you find?</Label>
                <Input id="rts-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Cleared a stuck bag; test vend OK" />
              </div>
              <Button size="sm" loading={busy} disabled={!note.trim()} onClick={returnToSale}>Return to sale</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <fieldset disabled={!canConfigure || busy} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {slot === null ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slot-code">Slot code</Label>
            <Input id="slot-code" value={slotCode} onChange={(event) => setSlotCode(event.target.value)} placeholder="e.g. A01" autoComplete="off" />
            {codeTaken ? <p className="text-xs text-danger">That slot already exists.</p> : null}
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="slot-product">Sells</Label>
          <select id="slot-product" value={product} onChange={(event) => setProduct(event.target.value)} className={field}>
            <option value="">Nothing (empty slot)</option>
            {products.filter((option) => option.active || keyOf(option.productCatalogue, option.productId) === product).map((option) => (
              <option key={keyOf(option.productCatalogue, option.productId)} value={keyOf(option.productCatalogue, option.productId)}>
                {option.name}{option.active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
          {slot && slot.currentQuantity > 0 ? <p className="text-xs text-muted-foreground">Holds {slot.currentQuantity}. To change the product, empty it first with a stock adjustment.</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slot-price">Price (KES)</Label>
          <Input id="slot-price" inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} disabled={!canPrice} />
          {!canPrice ? <p className="text-xs text-muted-foreground">Someone with pricing permission sets prices.</p> : priceChanges ? <p className="text-xs text-warning">KES {slot!.priceKes.toLocaleString('en-KE')} → {Number(price).toLocaleString('en-KE')}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slot-capacity">Holds up to</Label>
          <Input id="slot-capacity" inputMode="numeric" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slot-position">Order on the panel</Label>
          <Input id="slot-position" inputMode="numeric" value={position} onChange={(event) => setPosition(event.target.value)} />
        </div>
        {slot?.manufacturerSlotId ? (
          <p className="self-end text-sm text-muted-foreground">Manufacturer calls it <code className="font-mono">{slot.manufacturerSlotId}</code>.</p>
        ) : null}
      </fieldset>

      {history.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last vends, newest first</p>
          <p className="flex flex-wrap gap-1">
            {history.map((status, index) => <Badge key={index} variant={status === 'success' ? 'outline' : 'danger'}>{OUTCOME[status] ?? status}</Badge>)}
          </p>
        </div>
      ) : null}

      <Message result={result} />
      <div className="flex flex-wrap gap-2">
        {canConfigure ? <Button loading={busy} disabled={!valid} onClick={save}>{slot ? 'Save slot' : 'Add slot'}</Button> : null}
        {slot && canToggle && !slot.quarantine ? (
          <Button variant="outline" disabled={busy} onClick={() => toggle(!slot.enabled)}>{slot.enabled ? 'Switch off' : 'Switch on'}</Button>
        ) : null}
      </div>
    </section>
  );
}
