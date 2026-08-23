'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ManualPaymentMethod } from '@/types';

const METHODS: { value: ManualPaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa_manual', label: 'M-Pesa (sent by customer)' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

/**
 * Fixes a payment recorded by hand (§ correcting a manually recorded
 * payment) — a mistyped M-Pesa code, the wrong method picked.
 *
 * Before this, `manualPayment` was written once at order creation and
 * nothing could touch it: the only remedies for a typo were leaving
 * wrong data in the books or deleting a real order.
 *
 * It deliberately offers no amount field. What the order cost is not a
 * typo to fix here — that is the refund path, and putting the total in
 * an edit box next to a receipt number invites exactly the change this
 * must not make.
 */
export function CorrectManualPaymentDialog({
  orderId,
  currentMethod,
  currentReference,
  currentNote,
}: {
  orderId: string;
  currentMethod: ManualPaymentMethod;
  currentReference: string | null;
  currentNote: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<ManualPaymentMethod>(currentMethod);
  const [reference, setReference] = useState(currentReference ?? '');
  const [note, setNote] = useState(currentNote ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const referenceRequired = method !== 'cash';

  async function submit() {
    if (referenceRequired && !reference.trim()) {
      setError('A payment reference is required for an M-Pesa or bank transfer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/manual-payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, reference: reference.trim() || null, note: note.trim() || null }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `The correction failed (HTTP ${response.status}).`);
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The correction failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="mt-3">
        <Pencil className="size-4" aria-hidden="true" />
        Correct payment details
      </Button>
    );
  }

  return (
    <div className="border-border bg-surface mt-3 flex flex-col gap-3 rounded-xl border p-4">
      <div>
        <p className="text-foreground text-sm font-semibold">Correct payment details</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Fixes what was typed in. It does not change the amount, and the person who first recorded
          the payment stays on the record.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="correct-method">How the money arrived</Label>
        <select
          id="correct-method"
          value={method}
          onChange={(event) => setMethod(event.target.value as ManualPaymentMethod)}
          className="border-border bg-background text-foreground h-10 rounded-md border px-3 text-sm"
        >
          {METHODS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="correct-reference">
          Reference{' '}
          <span className="text-muted-foreground font-normal">
            {referenceRequired ? '(required)' : '(cash has none)'}
          </span>
        </Label>
        <Input
          id="correct-reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="QGH7XXXXXX"
          disabled={!referenceRequired}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="correct-note">Note (optional)</Label>
        <Input
          id="correct-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why this was corrected"
        />
      </div>

      {error ? (
        <p className="text-danger flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={submit} loading={busy} size="sm">
          Save correction
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
