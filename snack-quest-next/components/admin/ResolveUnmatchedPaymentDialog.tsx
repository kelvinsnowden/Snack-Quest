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

/**
 * Acknowledges an unmatched payment (§ Payment reconciliation) — a
 * staff member has investigated it outside this system (against
 * Safaricom's own M-Pesa statements) and records what they found.
 * This is NOT an "auto-create the missing order" action: a truly
 * unmatched payment has no reliable link back to a specific
 * conversation/order to attach it to, so resolving it here means
 * closing the loop on tracking, not fabricating a shortcut around
 * order creation's real invariants (stock reservation, referral
 * commission) that only ever run from a real payment confirmation.
 */
export function ResolveUnmatchedPaymentDialog({ providerEventId }: { providerEventId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setNote('');
    setError(null);
  }

  async function onSubmit() {
    if (!note.trim()) {
      setError('Record what you found before resolving this.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/reconciliation/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerEventId, note: note.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not resolve this payment.');
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve this payment.');
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
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Resolve
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve unmatched payment</DialogTitle>
          <DialogDescription>
            Record what you found after checking this against Safaricom&apos;s own M-Pesa statement — e.g. a
            duplicate payment, a customer who paid the wrong number, or a real order you created manually.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="note">What happened</Label>
          <Textarea
            id="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Customer accidentally paid twice — refunded the duplicate via M-Pesa till directly."
            aria-invalid={Boolean(error) || undefined}
          />
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={submitting}>
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
