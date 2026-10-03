'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, PackageCheck, RotateCcw, Send, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type SaleReviewActionKey = 'confirm_delivered' | 'start_refund' | 'reverse_payment' | 'record_refund' | 'acknowledge_conflict';

export interface SaleReviewActionState {
  action: SaleReviewActionKey;
  allowed: boolean;
  reason: string | null;
}

interface ActionCopy {
  label: string;
  icon: LucideIcon;
  title: string;
  description: (amount: string) => string;
  notePrompt: string;
  confirm: string;
  variant: 'primary' | 'outline';
}

const COPY: Record<SaleReviewActionKey, ActionCopy> = {
  confirm_delivered: {
    label: 'Customer got it',
    icon: PackageCheck,
    title: 'Confirm the customer got the product',
    description: () => 'The sale counts as delivered revenue and one item leaves the slot. Use this only when you have checked — camera, slot count, or the customer.',
    notePrompt: 'How do you know? (e.g. “Slot count dropped by one; customer confirmed by phone”)',
    confirm: 'Mark delivered',
    variant: 'outline',
  },
  start_refund: {
    label: 'Refund',
    icon: Undo2,
    title: 'Refund this sale',
    description: (amount) => `Records that ${amount} is owed back to the customer. You send the money in the next step.`,
    notePrompt: 'Why is the money going back? (e.g. “Slot jammed; nothing dropped”)',
    confirm: 'Mark refund owed',
    variant: 'primary',
  },
  reverse_payment: {
    label: 'Reverse M-Pesa payment',
    icon: RotateCcw,
    title: 'Reverse the customer’s M-Pesa payment',
    description: (amount) => `Asks Safaricom to return ${amount} to the phone that paid. The sale is marked refunded when Safaricom confirms — usually within minutes.`,
    notePrompt: 'Anything the next person should know',
    confirm: 'Send reversal',
    variant: 'primary',
  },
  record_refund: {
    label: 'Record refund sent another way',
    icon: Send,
    title: 'Record a refund you sent',
    description: (amount) => `For when you sent ${amount} yourself — from the M-Pesa business app, or in cash at the site. Snack Quest can't check this payment, so your name goes on the record.`,
    notePrompt: 'How and when you sent it',
    confirm: 'Record refund',
    variant: 'outline',
  },
  acknowledge_conflict: {
    label: 'Close machine conflict',
    icon: AlertTriangle,
    title: 'Close the machine conflict',
    description: () => 'The machine reported something that contradicts this sale. Closing it records what you found; the sale, its money and its stock stay as they are. The owner’s settlement for this period can then be finalised.',
    notePrompt: 'What did you check, and what happened? (e.g. “Late jam report after a successful vend; slot count matches”)',
    confirm: 'Close conflict',
    variant: 'outline',
  },
};

/**
 * The decisions a person can make on one sale. Each opens a short form
 * that requires a written reason — it goes on the sale's history — and
 * the server re-checks everything before acting, so a button that was
 * valid when the page loaded can still be refused with an explanation.
 */
export function SaleReviewActions({ transactionId, amountLabel, actions }: { transactionId: string; amountLabel: string; actions: SaleReviewActionState[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<SaleReviewActionKey | null>(null);
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);

  const visible = actions.filter((entry) => entry.allowed || entry.action === 'reverse_payment' || entry.action === 'record_refund');
  const anyAllowed = actions.some((entry) => entry.allowed);

  function start(action: SaleReviewActionKey) {
    setOpen(action);
    setNote('');
    setReference('');
    setError(null);
  }

  async function submit() {
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vending/sales/${encodeURIComponent(transactionId)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: open, note, ...(open === 'record_refund' ? { reference } : {}) }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; message?: string; refundStatus?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `That didn't go through (HTTP ${response.status}).`);
      }
      setMessage({ tone: data?.refundStatus === 'failed' ? 'warning' : 'success', text: data?.message ?? 'Done.' });
      setOpen(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  const copy = open ? COPY[open] : null;
  const needsReference = open === 'record_refund';
  const canSubmit = note.trim().length >= 3 && (!needsReference || reference.trim().length >= 6);

  return (
    <div className="flex flex-col gap-3">
      {message ? (
        <p role="status" className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${message.tone === 'success' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
          {message.tone === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          <span>{message.text}</span>
        </p>
      ) : null}

      {!anyAllowed ? (
        <p className="text-sm text-muted-foreground">Nothing to decide on this sale right now.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((entry) => {
            const { icon: Icon, label, variant } = COPY[entry.action];
            return (
              <li key={entry.action} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <Button size="sm" variant={entry.allowed ? variant : 'outline'} disabled={!entry.allowed} onClick={() => start(entry.action)} className="sm:w-60 sm:justify-start">
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </Button>
                {!entry.allowed && entry.reason ? <span className="text-xs text-muted-foreground">{entry.reason}</span> : null}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open !== null} onOpenChange={(next) => (next ? null : setOpen(null))}>
        {copy ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>{copy.description(amountLabel)}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              {needsReference ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="refund-reference">Confirmation code of the money you sent</Label>
                  <Input id="refund-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. SJK4XY12AB" autoComplete="off" />
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="review-note">Reason (saved on this sale’s history)</Label>
                <Textarea id="review-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={copy.notePrompt} rows={3} maxLength={500} />
              </div>
              {error ? (
                <p role="alert" className="flex items-start gap-2 text-sm text-danger">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(null)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submit} loading={busy} disabled={!canSubmit}>
                {copy.confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
