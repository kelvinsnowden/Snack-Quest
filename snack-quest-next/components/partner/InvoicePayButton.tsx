'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Stage = { kind: 'idle' } | { kind: 'form' } | { kind: 'waiting' } | { kind: 'paid'; receipt: string | null } | { kind: 'error'; text: string };

/** How often, and for how long, to check whether the prompt was paid. A prompt expires on the phone after about a minute. */
const POLL_MS = 3000;
const POLL_FOR_MS = 120_000;

/**
 * Pay one invoice by M-Pesa: the owner confirms the number, a prompt goes to
 * that phone, and this waits for the answer. The amount is the invoice's,
 * set on the server — nothing here can change it.
 */
export function InvoicePayButton({ invoiceId, totalKes, defaultPhone }: { invoiceId: string; totalKes: number; defaultPhone: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [phone, setPhone] = useState(defaultPhone);
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function poll(startedAt: number) {
    timer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/vending/partners/me/invoices/${invoiceId}`, { cache: 'no-store' });
        const data = (await response.json()) as { status?: string; promptPending?: boolean; receipt?: string | null };
        if (data.status === 'paid') {
          setStage({ kind: 'paid', receipt: data.receipt ?? null });
          router.refresh();
          return;
        }
        if (data.status === 'open' && data.promptPending === false) {
          setStage({ kind: 'error', text: 'The payment didn’t go through. You can try again.' });
          return;
        }
      } catch {
        // A dropped check is retried on the next tick.
      }
      if (Date.now() - startedAt < POLL_FOR_MS) poll(startedAt);
      else setStage({ kind: 'error', text: 'We haven’t heard back from M-Pesa yet. If you paid, it will show here shortly.' });
    }, POLL_MS);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    try {
      const response = await fetch(`/api/vending/partners/me/invoices/${invoiceId}/pay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStage({ kind: 'error', text: data.error ?? 'Couldn’t send the M-Pesa prompt.' });
        return;
      }
      setStage({ kind: 'waiting' });
      poll(Date.now());
    } catch {
      setStage({ kind: 'error', text: 'Couldn’t reach Snack Quest. Check your connection and try again.' });
    } finally {
      setSending(false);
    }
  }

  if (stage.kind === 'paid') {
    return (
      <p role="status" className="flex items-center gap-2 text-sm font-medium text-success">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
        Paid{stage.receipt ? `, M-Pesa receipt ${stage.receipt}` : ''}. Thank you.
      </p>
    );
  }
  if (stage.kind === 'waiting') {
    return (
      <p role="status" className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground">
        <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        Check your phone and enter your M-Pesa PIN to pay KES {totalKes.toLocaleString('en-KE')}.
      </p>
    );
  }
  if (stage.kind === 'idle') {
    return (
      <Button onClick={() => setStage({ kind: 'form' })} className="w-full sm:w-auto">
        Pay KES {totalKes.toLocaleString('en-KE')}
      </Button>
    );
  }
  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`pay-${invoiceId}`}>M-Pesa number to pay from</Label>
        <Input id={`pay-${invoiceId}`} type="tel" inputMode="tel" autoComplete="tel" placeholder="07XXXXXXXX" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={sending} required />
      </div>
      {stage.kind === 'error' ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {stage.text}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={sending}>
          <Smartphone aria-hidden="true" />
          Send M-Pesa prompt
        </Button>
        <Button type="button" variant="outline" disabled={sending} onClick={() => setStage({ kind: 'idle' })}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
