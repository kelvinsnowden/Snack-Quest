'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  MAINTENANCE_COST_CATEGORIES,
  MAINTENANCE_COST_CATEGORY_LABEL,
  MAINTENANCE_REQUEST_CATEGORIES,
  MAINTENANCE_REQUEST_CATEGORY_LABEL,
  MAINTENANCE_REQUEST_TRANSITIONS,
  type MaintenanceRequestStatus,
} from '@/types/maintenance';

type Result = { ok: boolean; text: string } | null;
const selectClass = 'min-h-10 w-full rounded-md border border-border bg-surface px-2 text-sm';
const labelClass = 'flex flex-col gap-1 text-sm';

async function send(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<Record<string, unknown>> {
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

export interface MachineOption {
  id: string;
  code: string;
  hasOwner: boolean;
}

/** Log a problem on a machine (`maintenance.manage`). */
export function NewRequestForm({ machines, defaultMachineId }: { machines: MachineOption[]; defaultMachineId?: string }) {
  const { busy, result, run } = useAction();
  const [machineId, setMachineId] = useState(defaultMachineId ?? machines[0]?.id ?? '');
  const [category, setCategory] = useState<string>('not_dispensing');
  const [urgency, setUrgency] = useState<'normal' | 'urgent'>('normal');
  const [description, setDescription] = useState('');
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        void run('raise', async () => {
          await send('/api/vending/maintenance/requests', 'POST', { machineId, category, urgency, description });
          setDescription('');
          return 'Problem logged.';
        });
      }}
    >
      <label className={labelClass}>
        Machine
        <select className={selectClass} value={machineId} onChange={(event) => setMachineId(event.target.value)} required>
          {machines.map((machine) => (
            <option key={machine.id} value={machine.id}>
              {machine.code}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        What’s wrong
        <select className={selectClass} value={category} onChange={(event) => setCategory(event.target.value)}>
          {MAINTENANCE_REQUEST_CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {MAINTENANCE_REQUEST_CATEGORY_LABEL[key]}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Urgency
        <select className={selectClass} value={urgency} onChange={(event) => setUrgency(event.target.value as 'normal' | 'urgent')}>
          <option value="normal">Normal</option>
          <option value="urgent">Urgent: the machine can’t sell</option>
        </select>
      </label>
      <label className={`${labelClass} sm:col-span-3`}>
        Details
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={5} maxLength={1000} required placeholder="What happens, since when, which slot" />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button type="submit" loading={busy === 'raise'} disabled={!machineId}>
          Log problem
        </Button>
        <Message result={result} />
      </div>
    </form>
  );
}

/** The next steps a request can take (`maintenance.manage`). Resolving and cancelling ask what happened. */
export function RequestActions({ requestId, status }: { requestId: string; status: MaintenanceRequestStatus }) {
  const { busy, result, run } = useAction();
  const [mode, setMode] = useState<'scheduled' | 'resolved' | 'cancelled' | null>(null);
  const [date, setDate] = useState('');
  const [text, setText] = useState('');
  const next = MAINTENANCE_REQUEST_TRANSITIONS[status];
  if (next.length === 0) return null;
  const move = (to: MaintenanceRequestStatus, extra: Record<string, unknown> = {}) =>
    run(to, async () => {
      await send(`/api/vending/maintenance/requests/${requestId}`, 'PATCH', { status: to, ...extra });
      setMode(null);
      setText('');
      return to === 'resolved' ? 'Marked fixed.' : to === 'cancelled' ? 'Cancelled.' : to === 'scheduled' ? 'Visit scheduled.' : 'Marked as seen.';
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {next.includes('acknowledged') && status === 'open' ? (
          <Button size="sm" variant="outline" loading={busy === 'acknowledged'} onClick={() => void move('acknowledged')}>
            Mark seen
          </Button>
        ) : null}
        {next.includes('scheduled') ? (
          <Button size="sm" variant="outline" onClick={() => setMode(mode === 'scheduled' ? null : 'scheduled')}>
            Schedule visit
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => setMode(mode === 'resolved' ? null : 'resolved')}>
          Mark fixed
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMode(mode === 'cancelled' ? null : 'cancelled')}>
          Cancel
        </Button>
      </div>
      {mode === 'scheduled' ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void move('scheduled', { scheduledFor: date, note: text || undefined });
          }}
        >
          <label className={labelClass}>
            Visit date
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>
          <Button type="submit" size="sm" loading={busy === 'scheduled'}>
            Schedule
          </Button>
        </form>
      ) : null}
      {mode === 'resolved' || mode === 'cancelled' ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void move(mode, { resolution: text });
          }}
        >
          <label className={labelClass}>
            {mode === 'resolved' ? 'What was done' : 'Why it’s cancelled'}
            <Textarea value={text} onChange={(event) => setText(event.target.value)} minLength={3} maxLength={1000} required className="min-h-16" />
          </label>
          <div>
            <Button type="submit" size="sm" loading={busy === mode}>
              {mode === 'resolved' ? 'Mark fixed' : 'Cancel request'}
            </Button>
          </div>
        </form>
      ) : null}
      <Message result={result} />
    </div>
  );
}

/** Record what maintenance cost (`maintenance.costs.record`). “The owner” is offered only for a machine that has one. */
export function CostForm({ machines, requests, today, defaultMachineId, defaultRequestId }: { machines: MachineOption[]; requests: { id: string; machineId: string; label: string }[]; today: string; defaultMachineId?: string; defaultRequestId?: string }) {
  const { busy, result, run } = useAction();
  const [machineId, setMachineId] = useState(defaultMachineId ?? machines[0]?.id ?? '');
  const [occurredOn, setOccurredOn] = useState(today);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('repair');
  const [paidBy, setPaidBy] = useState<'snack_quest' | 'owner'>('snack_quest');
  const [requestId, setRequestId] = useState(defaultRequestId ?? '');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const machine = machines.find((entry) => entry.id === machineId);
  const machineRequests = requests.filter((request) => request.machineId === machineId);
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        void run('cost', async () => {
          await send('/api/vending/maintenance/costs', 'POST', {
            machineId,
            occurredOn,
            amountKes: Number(amount),
            category,
            paidBy: machine?.hasOwner ? paidBy : 'snack_quest',
            requestId: requestId || null,
            description,
            vendor: vendor || null,
          });
          setAmount('');
          setDescription('');
          setVendor('');
          return 'Cost recorded.';
        });
      }}
    >
      <label className={labelClass}>
        Machine
        <select
          className={selectClass}
          value={machineId}
          onChange={(event) => {
            setMachineId(event.target.value);
            setRequestId('');
          }}
          required
        >
          {machines.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.code}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Date
        <Input type="date" value={occurredOn} max={today} onChange={(event) => setOccurredOn(event.target.value)} required />
      </label>
      <label className={labelClass}>
        Amount (KES)
        <Input type="number" inputMode="numeric" min={1} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} required />
      </label>
      <label className={labelClass}>
        Kind
        <select className={selectClass} value={category} onChange={(event) => setCategory(event.target.value)}>
          {MAINTENANCE_COST_CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {MAINTENANCE_COST_CATEGORY_LABEL[key]}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Paid by
        <select className={selectClass} value={machine?.hasOwner ? paidBy : 'snack_quest'} onChange={(event) => setPaidBy(event.target.value as 'snack_quest' | 'owner')} disabled={!machine?.hasOwner}>
          <option value="snack_quest">Snack Quest</option>
          {machine?.hasOwner ? <option value="owner">The machine’s owner</option> : null}
        </select>
      </label>
      <label className={labelClass}>
        For problem (optional)
        <select className={selectClass} value={requestId} onChange={(event) => setRequestId(event.target.value)}>
          <option value="">Not linked</option>
          {machineRequests.map((request) => (
            <option key={request.id} value={request.id}>
              {request.label}
            </option>
          ))}
        </select>
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        What it was for
        <Input value={description} onChange={(event) => setDescription(event.target.value)} minLength={3} maxLength={500} required />
      </label>
      <label className={labelClass}>
        Supplier (optional)
        <Input value={vendor} onChange={(event) => setVendor(event.target.value)} maxLength={200} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button type="submit" loading={busy === 'cost'} disabled={!machineId}>
          Record cost
        </Button>
        <Message result={result} />
      </div>
    </form>
  );
}

/** Void a cost recorded in error (`maintenance.costs.record`). It stays on record, marked void. */
export function VoidCostButton({ costId }: { costId: string }) {
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
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void run('void', async () => {
          await send(`/api/vending/maintenance/costs/${costId}/void`, 'POST', { reason });
          setOpen(false);
          return 'Voided.';
        });
      }}
    >
      <Input aria-label="Why it’s voided" placeholder="Why it’s wrong" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} required className="w-48" />
      <Button type="submit" size="sm" variant="danger" loading={busy === 'void'}>
        Void cost
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Keep
      </Button>
      <Message result={result} />
    </form>
  );
}
