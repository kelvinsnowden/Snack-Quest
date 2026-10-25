'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Mode = 'idle' | 'pay' | 'void';

/**
 * Settle an owner invoice by hand: record a payment that came another way
 * (bank, cash) for the full amount, or cancel the charge with a reason.
 */
export function OwnerInvoiceActions({ invoiceId, number, totalKes }: { invoiceId: string; number: string; totalKes: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('idle');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(next: Mode) {
    setMode(next);
    setText('');
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/owner-invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mode === 'pay' ? { action: 'recordPayment', reference: text, amountKes: totalKes } : { action: 'void', reason: text }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? 'Couldn’t save.');
        return;
      }
      setMode('idle');
      router.refresh();
    } catch {
      setError('Couldn’t reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'idle') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => open('pay')}>
          Record payment
        </Button>
        <Button size="sm" variant="ghost" onClick={() => open('void')}>
          Cancel invoice
        </Button>
      </div>
    );
  }
  const inputId = `${mode}-${invoiceId}`;
  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2 rounded-md border border-border p-3 sm:max-w-sm">
      <Label htmlFor={inputId}>{mode === 'pay' ? `Payment reference for KES ${totalKes.toLocaleString('en-KE')}` : `Why cancel ${number}?`}</Label>
      <Input id={inputId} value={text} onChange={(event) => setText(event.target.value)} placeholder={mode === 'pay' ? 'Bank or M-Pesa reference' : 'e.g. Delivery recorded twice'} disabled={busy} required />
      {mode === 'void' ? <p className="text-caption text-muted-foreground">A cancelled management fee waives that period on the owner’s plan.</p> : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant={mode === 'void' ? 'danger' : 'primary'} loading={busy}>
          {mode === 'pay' ? 'Mark paid' : 'Cancel invoice'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setMode('idle')}>
          Back
        </Button>
      </div>
    </form>
  );
}
