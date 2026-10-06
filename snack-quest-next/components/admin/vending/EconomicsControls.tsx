'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  INVENTORY_OWNERS,
  MACHINE_OWNERSHIP_LABEL,
  MACHINE_OWNERSHIP_TYPES,
  MAINTENANCE_RESPONSIBILITIES,
  OWNER_COST_BASES,
  PRODUCT_PRICE_TYPE_LABEL,
  type CommercialTerms,
  type MachineOwnershipType,
  type ProductPriceType,
} from '@/types/economics';

type Result = { ok: boolean; text: string } | null;

async function send(url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new Error((data?.message as string) ?? (data?.error as string) ?? `Couldn't save (HTTP ${response.status}).`);
  return data ?? {};
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

const selectClass = 'min-h-10 w-full rounded-md border border-border bg-surface px-2 text-sm';

const LABELS = {
  inventoryOwner: { snack_quest: 'Snack Quest owns the stock', machine_owner: 'The owner buys the stock' },
  ownerCostBasis: { landed_cost: 'At Snack Quest’s cost', wholesale_price: 'At the owner wholesale price' },
  maintenanceResponsibility: { snack_quest: 'Snack Quest', owner: 'The owner' },
} as const;

/** Who owns a machine. Changing it to or from Snack Quest follows the owner assignment; this sets the kind of owner. */
export function OwnershipTypeControl({ machineId, current, hasOwner }: { machineId: string; current: MachineOwnershipType; hasOwner: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState<MachineOwnershipType>(current);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const options = MACHINE_OWNERSHIP_TYPES.filter((type) => (hasOwner ? type !== 'snack_quest' : type === 'snack_quest'));

  async function save() {
    setBusy(true);
    setResult(null);
    try {
      await send(`/api/vending/machines/${machineId}/economics`, 'PATCH', { ownershipType: value });
      setResult({ ok: true, text: 'Saved.' });
      router.refresh();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : 'Couldn’t save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="ownership-type">Kind of owner</Label>
      <div className="flex flex-wrap items-center gap-2">
        <select id="ownership-type" className={`${selectClass} max-w-60`} value={value} onChange={(event) => setValue(event.target.value as MachineOwnershipType)}>
          {options.map((type) => (
            <option key={type} value={type}>
              {MACHINE_OWNERSHIP_LABEL[type]}
            </option>
          ))}
        </select>
        <Button size="sm" loading={busy} disabled={value === current} onClick={save}>
          Save
        </Button>
      </div>
      {!hasOwner ? <p className="text-caption text-muted-foreground">To make this an owner’s machine, assign the owner on the machine’s setup page first.</p> : null}
      <Message result={result} />
    </div>
  );
}

/**
 * The terms on an owner agreement that decide the money. A change only
 * affects sales from now on: every sale already made keeps the terms frozen
 * in its own record.
 */
export function AgreementTermsEditor({ partnerId, agreementId, terms }: { partnerId: string; agreementId: string; terms: CommercialTerms }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CommercialTerms>(terms);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function save() {
    setBusy(true);
    setResult(null);
    try {
      await send(`/api/vending/partners/${partnerId}/agreements/${agreementId}`, 'PATCH', { terms: draft });
      setResult({ ok: true, text: 'Terms saved. They apply to sales from now on.' });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : 'Couldn’t save.' });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Edit terms
        </Button>
        <Message result={result} />
      </div>
    );
  }
  return (
    <div className="flex min-w-72 flex-col gap-3 rounded-md border border-border p-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-caption text-muted-foreground">Stock</span>
        <select className={selectClass} value={draft.inventoryOwner} onChange={(event) => setDraft({ ...draft, inventoryOwner: event.target.value as CommercialTerms['inventoryOwner'] })}>
          {INVENTORY_OWNERS.map((value) => (
            <option key={value} value={value}>{LABELS.inventoryOwner[value]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-caption text-muted-foreground">What the owner pays for stock</span>
        <select className={selectClass} value={draft.ownerCostBasis} onChange={(event) => setDraft({ ...draft, ownerCostBasis: event.target.value as CommercialTerms['ownerCostBasis'] })}>
          {OWNER_COST_BASES.map((value) => (
            <option key={value} value={value}>{LABELS.ownerCostBasis[value]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-caption text-muted-foreground">Owner’s share of advertising revenue (%)</span>
        <Input type="number" min={0} max={100} value={draft.adRevenueSharePartnerPct} onChange={(event) => setDraft({ ...draft, adRevenueSharePartnerPct: Number(event.target.value) })} className="min-h-10 tabular-nums" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-caption text-muted-foreground">Maintenance is paid by</span>
        <select className={selectClass} value={draft.maintenanceResponsibility} onChange={(event) => setDraft({ ...draft, maintenanceResponsibility: event.target.value as CommercialTerms['maintenanceResponsibility'] })}>
          {MAINTENANCE_RESPONSIBILITIES.map((value) => (
            <option key={value} value={value}>{LABELS.maintenanceResponsibility[value]}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.showLandedCostToOwner} onChange={(event) => setDraft({ ...draft, showLandedCostToOwner: event.target.checked })} />
        Owner may see Snack Quest’s own cost
      </label>
      <div className="flex gap-2">
        <Button size="sm" loading={busy} onClick={save}>
          Save terms
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <Message result={result} />
    </div>
  );
}

interface PriceHistoryRow {
  id: string;
  priceType: ProductPriceType;
  amountKes: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string;
}

const dateTime = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' });

/**
 * A product's price book: the prices this person may see, their history,
 * and a form for the price types they may change. Every change needs a
 * reason and takes effect now; past sales keep the prices they were sold at.
 */
export function PriceBookEditor({ productCatalogue, productId, editableTypes }: { productCatalogue: 'snackItem' | 'package'; productId: string; editableTypes: ProductPriceType[] }) {
  const [loaded, setLoaded] = useState<{ visibleTypes: ProductPriceType[]; current: Partial<Record<ProductPriceType, number | null>>; history: PriceHistoryRow[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [priceType, setPriceType] = useState<ProductPriceType | ''>(editableTypes[0] ?? '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const url = `/api/admin/price-book/${productCatalogue}/${productId}/prices`;

  async function load() {
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();
    if (response.ok) setLoaded(data);
    else setResult({ ok: false, text: data?.message ?? data?.error ?? 'Couldn’t load prices.' });
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) await load();
  }

  async function save() {
    if (!priceType) return;
    setBusy(true);
    setResult(null);
    try {
      await send(url, 'POST', { priceType, amountKes: Number(amount), reason });
      setAmount('');
      setReason('');
      setResult({ ok: true, text: 'Price recorded. Past sales keep the price they were sold at.' });
      await load();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : 'Couldn’t save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="sm" variant="ghost" onClick={toggle} className="self-start">
        {open ? 'Hide prices' : 'Prices & history'}
      </Button>
      {open && loaded ? (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3 text-sm">
          {loaded.visibleTypes.length === 0 ? <p className="text-muted-foreground">You don’t have access to this product’s prices.</p> : null}
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
            {loaded.visibleTypes.map((type) => (
              <div key={type} className="contents">
                <dt className="text-muted-foreground">{PRODUCT_PRICE_TYPE_LABEL[type]}</dt>
                <dd className="text-right">{loaded.current[type] == null ? 'not set' : `KES ${loaded.current[type]!.toLocaleString('en-KE')}`}</dd>
              </div>
            ))}
          </dl>
          {editableTypes.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-caption text-muted-foreground">Price</span>
                <select className={selectClass} value={priceType} onChange={(event) => setPriceType(event.target.value as ProductPriceType)}>
                  {editableTypes.map((type) => (
                    <option key={type} value={type}>{PRODUCT_PRICE_TYPE_LABEL[type]}</option>
                  ))}
                </select>
              </label>
              <label className="flex w-28 flex-col gap-1">
                <span className="text-caption text-muted-foreground">KES</span>
                <Input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} className="min-h-10 tabular-nums" />
              </label>
              <label className="flex min-w-48 flex-1 flex-col gap-1">
                <span className="text-caption text-muted-foreground">Why</span>
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. supplier raised prices" className="min-h-10" />
              </label>
              <Button size="sm" loading={busy} disabled={!amount.trim() || reason.trim().length < 3} onClick={save}>
                Record price
              </Button>
            </div>
          ) : null}
          {loaded.history.length > 0 ? (
            <table className="w-full text-caption">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2">Price</th>
                  <th className="py-1 pr-2 text-right">KES</th>
                  <th className="py-1 pr-2">From</th>
                  <th className="py-1 pr-2">To</th>
                  <th className="py-1">Why</th>
                </tr>
              </thead>
              <tbody>
                {loaded.history.map((row) => (
                  <tr key={row.id} className="border-t border-border tabular-nums">
                    <td className="py-1 pr-2">{PRODUCT_PRICE_TYPE_LABEL[row.priceType]}</td>
                    <td className="py-1 pr-2 text-right">{row.amountKes.toLocaleString('en-KE')}</td>
                    <td className="py-1 pr-2">{dateTime.format(new Date(row.effectiveFrom))}</td>
                    <td className="py-1 pr-2">{row.effectiveTo ? dateTime.format(new Date(row.effectiveTo)) : 'now'}</td>
                    <td className="py-1">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
      <Message result={result} />
    </div>
  );
}

/** Take stock out of a slot for a reason — expired, damaged or returned to the warehouse. */
export function RemoveStockForm({ machineId, slotCode, quantity }: { machineId: string; slotCode: string; quantity: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState('1');
  const [reason, setReason] = useState<'expired' | 'damaged' | 'returned'>('expired');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function save() {
    setBusy(true);
    setResult(null);
    try {
      await send(`/api/vending/machines/${machineId}/slots/remove`, 'POST', { slotCode, quantity: Number(count), reason, note });
      setOpen(false);
      setNote('');
      router.refresh();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : 'Couldn’t save.' });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" disabled={quantity <= 0} onClick={() => setOpen(true)}>
        Remove stock
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2 text-sm">
      <label className="flex w-20 flex-col gap-1">
        <span className="text-caption text-muted-foreground">How many</span>
        <Input inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} className="min-h-10 tabular-nums" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-caption text-muted-foreground">Why</span>
        <select className={selectClass} value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}>
          <option value="expired">Expired</option>
          <option value="damaged">Damaged</option>
          <option value="returned">Back to the warehouse</option>
        </select>
      </label>
      <label className="flex min-w-40 flex-1 flex-col gap-1">
        <span className="text-caption text-muted-foreground">What happened</span>
        <Input value={note} onChange={(event) => setNote(event.target.value)} className="min-h-10" />
      </label>
      <Button size="sm" loading={busy} disabled={!note.trim()} onClick={save}>
        Remove
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <Message result={result} />
    </div>
  );
}
