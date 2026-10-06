'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MAINTENANCE_REQUEST_CATEGORIES, MAINTENANCE_REQUEST_CATEGORY_LABEL } from '@/types/maintenance';

const selectClass = 'min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base sm:text-sm';

/** An owner reports a problem with their machine; Snack Quest sees it on its Maintenance page. */
export function MaintenanceRequestForm({ machineId }: { machineId: string }) {
  const router = useRouter();
  const [category, setCategory] = useState<string>('not_dispensing');
  const [urgent, setUrgent] = useState(false);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/vending/partners/me/machines/${machineId}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, description, urgency: urgent ? 'urgent' : 'normal' }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage({ ok: false, text: data.error ?? 'Could not send the report.' });
        return;
      }
      setDescription('');
      setUrgent(false);
      setMessage({ ok: true, text: 'Sent. Snack Quest will follow up here.' });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: 'Could not reach Snack Quest. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        What’s wrong
        <select className={selectClass} value={category} onChange={(event) => setCategory(event.target.value)}>
          {MAINTENANCE_REQUEST_CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {MAINTENANCE_REQUEST_CATEGORY_LABEL[key]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
        Tell us more
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={5} maxLength={1000} required placeholder="What happens, since when, which slot" />
      </label>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" className="size-5" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} />
        The machine can’t sell at all
      </label>
      <div>
        <Button type="submit" variant="secondary" loading={busy}>
          <Wrench aria-hidden="true" />
          Report problem
        </Button>
      </div>
      {message ? (
        <p role={message.ok ? 'status' : 'alert'} className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${message.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {message.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

/** An owner withdraws a report that no longer needs a visit. */
export function WithdrawRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Withdraw
      </Button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const response = await fetch(`/api/vending/partners/me/maintenance/${requestId}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          if (!response.ok) {
            setError(data.error ?? 'Could not withdraw it.');
            return;
          }
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <input aria-label="Why" placeholder="Why (e.g. it fixed itself)" className="min-h-11 rounded-md border border-border bg-surface px-3 text-base sm:text-sm" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} required />
      <Button type="submit" size="sm" variant="outline" loading={busy}>
        Withdraw report
      </Button>
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
    </form>
  );
}
