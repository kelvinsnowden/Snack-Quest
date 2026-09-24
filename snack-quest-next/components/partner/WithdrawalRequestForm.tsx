'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * § WITHDRAWAL — the owner's own request. Amount and phone number are
 * the only inputs; everything that prevents overdraft, duplicate
 * withdrawal, and a race between two concurrent requests happens
 * server-side inside `withdrawalService.requestWithdrawal`'s own
 * Firestore transaction — this form's job is only to surface whatever
 * that layer decides, never to second-guess it client-side.
 */
export function WithdrawalRequestForm({ availableKes }: { availableKes: number }) {
  const router = useRouter();
  const [amountKes, setAmountKes] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch('/api/vending/partners/me/withdrawals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountKes: Number(amountKes), phoneNumber }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not request a withdrawal.');
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setAmountKes('');
      router.refresh();
    } catch {
      setError('Could not reach Snack Quest. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="amountKes">Amount (KES)</Label>
        <Input
          id="amountKes"
          type="number"
          min={1}
          max={availableKes}
          inputMode="numeric"
          placeholder={`Up to ${availableKes.toLocaleString('en-KE')}`}
          value={amountKes}
          onChange={(event) => setAmountKes(event.target.value)}
          disabled={submitting}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phoneNumber">M-Pesa number</Label>
        <Input
          id="phoneNumber"
          type="tel"
          inputMode="tel"
          placeholder="07XXXXXXXX"
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
          disabled={submitting}
          required
        />
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {success ? <p className="text-sm text-success">Withdrawal requested — you&apos;ll be notified once it&apos;s paid.</p> : null}
      <Button type="submit" loading={submitting} disabled={availableKes <= 0}>
        <Send aria-hidden="true" />
        Request withdrawal
      </Button>
    </form>
  );
}
