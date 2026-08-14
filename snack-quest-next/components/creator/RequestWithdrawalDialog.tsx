'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { formatKes } from '@/lib/orders/format';
import { MIN_WITHDRAWAL_KES } from '@/lib/withdrawals/rules';

/** A creator requesting a withdrawal from their own available balance (§ Creator Portal withdrawals). */
export function RequestWithdrawalDialog({
  availableCashKes,
  defaultPhoneNumber,
}: {
  availableCashKes: number;
  defaultPhoneNumber: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amountKes, setAmountKes] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(defaultPhoneNumber ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAmountKes('');
    setPhoneNumber(defaultPhoneNumber ?? '');
    setError(null);
  }

  async function onSubmit() {
    const amount = Number(amountKes);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (amount < MIN_WITHDRAWAL_KES) {
      setError(`Minimum withdrawal is ${formatKes(MIN_WITHDRAWAL_KES)}.`);
      return;
    }
    if (amount > availableCashKes) {
      setError(`You only have ${formatKes(availableCashKes)} available.`);
      return;
    }
    if (!/^254\d{9}$/.test(phoneNumber.trim())) {
      setError('Enter a valid M-Pesa number, e.g. 254712345678.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/creator/withdrawals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountKes: amount, phoneNumber: phoneNumber.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not request this withdrawal.');
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request this withdrawal.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={availableCashKes < MIN_WITHDRAWAL_KES}>
          <Wallet aria-hidden="true" />
          Withdraw
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a withdrawal</DialogTitle>
          <DialogDescription>
            {formatKes(availableCashKes)} available. Paid out via M-Pesa. Minimum withdrawal is{' '}
            {formatKes(MIN_WITHDRAWAL_KES)}.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amountKes">Amount (KES)</Label>
            <Input
              id="amountKes"
              type="number"
              min={MIN_WITHDRAWAL_KES}
              max={availableCashKes}
              step={1}
              value={amountKes}
              onChange={(event) => setAmountKes(event.target.value)}
              placeholder="0"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phoneNumber">M-Pesa number</Label>
            <Input
              id="phoneNumber"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="254712345678"
            />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={submitting}>
            Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
