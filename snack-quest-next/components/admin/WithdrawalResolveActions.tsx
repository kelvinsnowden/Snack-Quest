'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Resolution = 'confirmed_paid' | 'confirmed_failed';

/**
 * Settling a withdrawal whose B2C outcome is genuinely unknown
 * (§ Daraja B2C production readiness).
 *
 * The endpoint behind this has existed since the B2C work and had no
 * control anywhere in the admin, so the one state a withdrawal can get
 * stuck in — money possibly sent, Safaricom not saying — was the one
 * state an admin could not act on without hand-writing a request.
 *
 * Deliberately not a guess. The note is required because an admin is
 * expected to have read Safaricom's own merchant statement first, and
 * the note is where that check goes on the record; the two outcomes
 * are separate buttons rather than a dropdown because they do opposite
 * things to a creator's balance and must never be a mis-click apart.
 */
export function WithdrawalResolveActions({
  withdrawalId,
  amountKes,
}: {
  withdrawalId: string;
  amountKes: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Resolution | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paid = open === 'confirmed_paid';

  async function resolve() {
    if (!open) return;
    if (!note.trim()) {
      setError('A note is required — say what you checked on the statement.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/withdrawals/${withdrawalId}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution: open, note: note.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not resolve this withdrawal.');
      }
      setOpen(null);
      setNote('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve this withdrawal.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setOpen('confirmed_paid')}>
        Confirm it was paid
      </Button>
      <Button size="sm" variant="outline" onClick={() => setOpen('confirmed_failed')}>
        Confirm it failed
      </Button>

      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(null);
            setError(null);
            setNote('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {paid ? 'Confirm this payout reached them' : 'Confirm this payout never left'}
            </DialogTitle>
            <DialogDescription>
              {paid
                ? `Records ${formatAmount(amountKes)} as paid. The balance stays reserved, because the money is gone.`
                : `Marks this failed and refunds ${formatAmount(amountKes)} to their balance, so they can request it again.`}{' '}
              Check Safaricom&rsquo;s merchant statement before either — this is the record of what
              actually happened, and nothing here re-checks it.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-1.5">
            <Label htmlFor="resolve-note">What did you check?</Label>
            <Textarea
              id="resolve-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Found on the 8 Sep statement, receipt UI4CP57HIJ"
              aria-invalid={Boolean(error) || undefined}
            />
            {error ? <p className="text-danger text-sm">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={resolve} loading={submitting}>
              {paid ? 'Mark as paid' : 'Mark as failed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatAmount(amountKes: number): string {
  return `KES ${amountKes.toLocaleString('en-KE')}`;
}
