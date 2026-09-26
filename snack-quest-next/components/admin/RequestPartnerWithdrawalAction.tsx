'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Staff-initiated withdrawal request on a partner's behalf
 * (§ OWNER WITHDRAWAL, docs/MACHINE_COMMERCE.md §7/§9) — there is no
 * partner login yet, so a staff member requests the withdrawal here.
 * Every downstream step (approve/reject/pay-manually) is the exact
 * same B2C engine a creator withdrawal already goes through, on
 * `/admin/withdrawals`.
 */
export function RequestPartnerWithdrawalAction({ partnerId, availableCashKes }: { partnerId: string; availableCashKes: number }) {
  const router = useRouter();
  const [amountKes, setAmountKes] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/partners/${partnerId}/withdrawals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountKes: Number(amountKes), phoneNumber }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `Could not request the withdrawal (HTTP ${response.status}).`);
      }
      setAmountKes('');
      setPhoneNumber('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request the withdrawal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="withdrawal-amount" className="text-caption font-medium text-muted-foreground">
          Amount (KES) — max KES {availableCashKes.toLocaleString('en-KE')}
        </label>
        <input
          id="withdrawal-amount"
          type="number"
          min={1}
          required
          value={amountKes}
          onChange={(event) => setAmountKes(event.target.value)}
          className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="withdrawal-phone" className="text-caption font-medium text-muted-foreground">
          M-Pesa phone number
        </label>
        <input
          id="withdrawal-phone"
          type="tel"
          required
          placeholder="254712345678"
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
          className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
        />
      </div>
      <Button type="submit" loading={busy} size="sm" variant="outline">
        <Banknote className="size-4" aria-hidden="true" />
        Request withdrawal
      </Button>
      {error ? (
        <p className="flex items-start gap-2 text-sm text-danger sm:basis-full">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </form>
  );
}
