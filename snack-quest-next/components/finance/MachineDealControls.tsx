'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MACHINE_COST_CATEGORIES, MACHINE_COST_CATEGORY_GROUP, MACHINE_COST_CATEGORY_LABEL } from '@/types/machineDeal';

type Result = { ok: boolean; text: string } | null;
const selectClass = 'min-h-10 w-full rounded-md border border-border bg-surface px-2 text-sm';
const labelClass = 'flex flex-col gap-1 text-sm';

async function send(url: string, method: 'POST' | 'PUT', body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new Error((data?.error as string) ?? `Couldn’t save (HTTP ${response.status}).`);
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

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  async function run(label: string, action: () => Promise<string>) {
    setBusy(label);
    setResult(null);
    try {
      setResult({ ok: true, text: await action() });
      router.refresh();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  }
  return { busy, result, run };
}

const shillings = (value: string) => Number(value.replace(/[,\s]/g, ''));

/** Records one landed or installation cost on a machine. */
export function MachineCostForm({ machineId, today }: { machineId: string; today: string }) {
  const { busy, result, run } = useAction();
  const [category, setCategory] = useState<string>('purchase');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(today);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void run('cost', async () => {
          await send(`/api/vending/machines/${machineId}/deal/costs`, 'POST', { category, description, amountKes: shillings(amount), occurredOn });
          setDescription('');
          setAmount('');
          return 'Cost recorded.';
        });
      }}
    >
      <label className={labelClass}>
        <span className="font-medium">What for</span>
        <select className={selectClass} value={category} onChange={(event) => setCategory(event.target.value)}>
          <optgroup label="Landed cost">
            {MACHINE_COST_CATEGORIES.filter((key) => MACHINE_COST_CATEGORY_GROUP[key] === 'landed').map((key) => (
              <option key={key} value={key}>
                {MACHINE_COST_CATEGORY_LABEL[key]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Installation">
            {MACHINE_COST_CATEGORIES.filter((key) => MACHINE_COST_CATEGORY_GROUP[key] === 'installation').map((key) => (
              <option key={key} value={key}>
                {MACHINE_COST_CATEGORY_LABEL[key]}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <label className={labelClass}>
        <span className="font-medium">Amount (KES)</span>
        <Input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 285000" className="min-h-10 tabular-nums" required />
        <span className="text-caption text-muted-foreground">Paid in another currency? Enter what it came to in shillings and put the original in the description.</span>
      </label>
      <label className={labelClass}>
        <span className="font-medium">Description</span>
        <Input value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Invoice 4411, USD 2,150 at 132.5" className="min-h-10" required />
      </label>
      <label className={labelClass}>
        <span className="font-medium">Date paid</span>
        <Input type="date" value={occurredOn} max={today} onChange={(event) => setOccurredOn(event.target.value)} className="min-h-10" required />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <div>
          <Button type="submit" loading={busy === 'cost'} disabled={!amount || !description.trim()}>
            Record cost
          </Button>
        </div>
        <Message result={result} />
      </div>
    </form>
  );
}

/** Voids one cost line with a reason. */
export function VoidMachineCostButton({ machineId, costId }: { machineId: string; costId: string }) {
  const { busy, result, run } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Void
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why (e.g. entered twice)" className="min-h-9 w-56" />
        <Button size="sm" variant="outline" loading={busy === 'void'} disabled={!reason.trim()} onClick={() => run('void', async () => (await send(`/api/vending/machines/${machineId}/deal/costs/${costId}/void`, 'POST', { reason }), 'Cost voided.'))}>
          Void cost
        </Button>
      </div>
      <Message result={result} />
    </div>
  );
}

/** States that the machine had no installation cost, so the profit isn’t held back waiting for one. */
export function NoInstallationCostToggle({ machineId, value }: { machineId: string; value: boolean }) {
  const { busy, result, run } = useAction();
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value} disabled={Boolean(busy)} onChange={(event) => run('install', async () => (await send(`/api/vending/machines/${machineId}/deal/installation`, 'PUT', { noInstallationCost: event.target.checked }), 'Saved.'))} />
        This machine had no installation cost
      </label>
      <Message result={result} />
    </div>
  );
}

/** Records the machine’s sale to an owner. */
export function MachineSaleForm({ machineId, today, owners, defaultBuyerId }: { machineId: string; today: string; owners: { id: string; name: string }[]; defaultBuyerId: string | null }) {
  const { busy, result, run } = useAction();
  const [buyer, setBuyer] = useState(defaultBuyerId ?? '');
  const [soldOn, setSoldOn] = useState(today);
  const [price, setPrice] = useState('');
  const [installation, setInstallation] = useState('0');
  const [note, setNote] = useState('');
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void run('sale', async () => {
          await send(`/api/vending/machines/${machineId}/deal/sale`, 'POST', { buyerPartnerId: buyer || null, soldOn, machinePriceKes: shillings(price), installationChargeKes: shillings(installation || '0'), note });
          return 'Sale recorded.';
        });
      }}
    >
      <label className={labelClass}>
        <span className="font-medium">Sold to</span>
        <select className={selectClass} value={buyer} onChange={(event) => setBuyer(event.target.value)}>
          <option value="">Not in the system yet</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        <span className="font-medium">Sale date</span>
        <Input type="date" value={soldOn} max={today} onChange={(event) => setSoldOn(event.target.value)} className="min-h-10" required />
      </label>
      <label className={labelClass}>
        <span className="font-medium">Machine price (KES)</span>
        <Input inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} className="min-h-10 tabular-nums" required />
      </label>
      <label className={labelClass}>
        <span className="font-medium">Installation charged (KES)</span>
        <Input inputMode="numeric" value={installation} onChange={(event) => setInstallation(event.target.value)} className="min-h-10 tabular-nums" />
        <span className="text-caption text-muted-foreground">0 if installation was included in the machine price.</span>
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        <span className="font-medium">Note (optional)</span>
        <Input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder="e.g. paid in two instalments" className="min-h-10" />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <div>
          <Button type="submit" loading={busy === 'sale'} disabled={!price}>
            Record sale
          </Button>
        </div>
        <Message result={result} />
      </div>
    </form>
  );
}

/** Cancels the recorded sale with a reason; it stays in the history. */
export function CancelMachineSaleButton({ machineId }: { machineId: string }) {
  const { busy, result, run } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Cancel this sale
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why (e.g. wrong price)" className="min-h-9 w-56" />
        <Button size="sm" variant="outline" loading={busy === 'cancel'} disabled={!reason.trim()} onClick={() => run('cancel', async () => (await send(`/api/vending/machines/${machineId}/deal/sale/cancel`, 'POST', { reason }), 'Sale cancelled.'))}>
          Cancel sale
        </Button>
      </div>
      <Message result={result} />
    </div>
  );
}
