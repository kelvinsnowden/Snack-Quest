'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, Plus, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { WalletLedgerEntry } from '@/types';

/** `createdAt` is pre-formatted server-side (a Firestore Timestamp can't cross the Server → Client Component boundary as a prop). */
export interface WalletLedgerRow {
  id: string;
  type: WalletLedgerEntry['type'];
  amountKes: number;
  balanceAfterKes: number;
  note: string;
  createdAt: string;
}

const TYPE_LABELS: Record<WalletLedgerEntry['type'], string> = {
  milestone_bonus: 'Loyalty bonus',
  checkout_redemption: 'Redeemed at checkout',
  admin_adjustment: 'Manual adjustment',
};

function AdjustWalletDialog({
  phoneNumber,
  onAdjusted,
}: {
  phoneNumber: string;
  onAdjusted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDirection('credit');
    setAmount('');
    setNote('');
    setError(null);
  }

  async function onSubmit() {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a positive amount.');
      return;
    }
    if (!note.trim()) {
      setError('A note is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/customers/${encodeURIComponent(phoneNumber)}/wallet`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountKes: direction === 'credit' ? parsed : -parsed, note: note.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not adjust this wallet.');
      }
      setOpen(false);
      reset();
      onAdjusted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not adjust this wallet.');
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
        <Button size="sm" variant="outline">
          Adjust balance
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust wallet balance</DialogTitle>
          <DialogDescription>A goodwill credit, or correcting a mistake — takes effect immediately.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={direction === 'credit' ? 'primary' : 'outline'}
              onClick={() => setDirection('credit')}
            >
              <Plus className="size-4" aria-hidden="true" />
              Credit
            </Button>
            <Button
              type="button"
              size="sm"
              variant={direction === 'debit' ? 'primary' : 'outline'}
              onClick={() => setDirection('debit')}
            >
              <Minus className="size-4" aria-hidden="true" />
              Debit
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adjust-amount">Amount (KES)</Label>
            <Input id="adjust-amount" type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adjust-note">Note</Label>
            <Input
              id="adjust-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Apology credit for delayed order"
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={submitting}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerWalletCard({
  phoneNumber,
  balanceKes,
  lifetimeCreditsEarnedKes,
  ledger,
}: {
  phoneNumber: string;
  balanceKes: number;
  lifetimeCreditsEarnedKes: number;
  ledger: WalletLedgerRow[];
}) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-primary" aria-hidden="true" />
          Quest wallet
        </CardTitle>
        <AdjustWalletDialog phoneNumber={phoneNumber} onAdjusted={() => router.refresh()} />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-caption text-muted-foreground uppercase">Current balance</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{formatKes(balanceKes)}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground uppercase">Lifetime earned</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{formatKes(lifetimeCreditsEarnedKes)}</p>
          </div>
        </div>

        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wallet activity yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="border-b border-border text-left text-caption text-muted-foreground uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Balance after</th>
                  <th className="py-2 pr-4 font-medium">Note</th>
                  <th className="py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 text-foreground">{TYPE_LABELS[entry.type]}</td>
                    <td className={`py-2 pr-4 tabular-nums font-medium ${entry.amountKes >= 0 ? 'text-success' : 'text-danger'}`}>
                      {entry.amountKes >= 0 ? '+' : ''}
                      {formatKes(entry.amountKes)}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-foreground">{formatKes(entry.balanceAfterKes)}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{entry.note}</td>
                    <td className="py-2 text-muted-foreground tabular-nums">{entry.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
