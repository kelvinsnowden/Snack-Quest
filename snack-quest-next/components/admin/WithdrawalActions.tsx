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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function WithdrawalActions({ withdrawalId, amountKes }: { withdrawalId: string; amountKes: number }) {
  const router = useRouter();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function approve() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/withdrawals/${withdrawalId}/approve`, { method: 'POST' });
      const body = (await response.json().catch(() => null)) as { status?: string; error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? 'Could not approve this withdrawal.');
      }
      if (body?.status === 'failed') {
        setResult('The B2C payout request was rejected by Safaricom — the withdrawal was marked failed and the balance refunded.');
        setSubmitting(false);
        router.refresh();
        return;
      }
      setApproveOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve this withdrawal.');
      setSubmitting(false);
    }
  }

  async function reject() {
    if (!reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/withdrawals/${withdrawalId}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not reject this withdrawal.');
      }
      setRejectOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject this withdrawal.');
    } finally {
      setSubmitting(false);
    }
  }

  /*
   * Recording a payout that already happened, rather than sending one.
   * Both fields are required by the API and checked here too, so the
   * dialog says which one is missing instead of the request coming
   * back with an error about a form the person can still see.
   */
  async function payManually() {
    if (!reference.trim()) {
      setError('The M-Pesa code from the transfer is required.');
      return;
    }
    if (!manualNote.trim()) {
      setError('A note is required — why was this paid by hand?');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/withdrawals/${withdrawalId}/pay-manually`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference: reference.trim(), note: manualNote.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not record this payment.');
      }
      setManualOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record this payment.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={approveOpen} onOpenChange={(open) => { setApproveOpen(open); if (!open) { setError(null); setResult(null); } }}>
        <Button size="sm" onClick={() => setApproveOpen(true)}>
          Approve
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve this withdrawal?</DialogTitle>
            <DialogDescription>
              This immediately sends a real M-Pesa B2C payout request for KES {amountKes.toLocaleString('en-KE')}.
            </DialogDescription>
          </DialogHeader>
          {result ? (
            <p className="mt-4 text-sm text-danger">{result}</p>
          ) : (
            <>
              {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setApproveOpen(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button onClick={approve} loading={submitting}>
                  Confirm payout
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={manualOpen}
        onOpenChange={(open) => {
          setManualOpen(open);
          if (!open) { setError(null); setReference(''); setManualNote(''); }
        }}
      >
        <Button size="sm" variant="outline" onClick={() => setManualOpen(true)}>
          Paid manually
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a payment you already sent</DialogTitle>
            <DialogDescription>
              For a payout sent from the M-Pesa app rather than through this system. Nothing is sent
              to Safaricom — this marks the withdrawal paid and records how it was settled. The
              creator&rsquo;s balance was already reduced when they requested it, so it does not
              change again.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-reference">M-Pesa code</Label>
              <Input
                id="manual-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="e.g. UI4CP57HIJ"
                autoCapitalize="characters"
                className="uppercase"
              />
              <p className="text-caption text-muted-foreground">
                From the confirmation SMS. This is what ties the record to your statement.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-note">Note</Label>
              <Textarea
                id="manual-note"
                value={manualNote}
                onChange={(event) => setManualNote(event.target.value)}
                placeholder="e.g. Sent from the M-Pesa app while B2C is being set up"
                aria-invalid={Boolean(error) || undefined}
              />
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManualOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={payManually} loading={submitting}>
              Mark as paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={(open) => { setRejectOpen(open); if (!open) { setError(null); setReason(''); } }}>
        <Button size="sm" variant="danger" onClick={() => setRejectOpen(true)}>
          Reject
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this withdrawal</DialogTitle>
            <DialogDescription>The reserved balance is refunded immediately.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-1.5">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Phone number could not be verified"
              aria-invalid={Boolean(error) || undefined}
            />
            {error ? <p className="text-xs text-danger">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={reject} loading={submitting}>
              Confirm rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
