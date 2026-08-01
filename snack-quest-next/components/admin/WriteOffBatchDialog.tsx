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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const REASONS = [
  { value: 'expired', label: 'Expired' },
  { value: 'written_off', label: 'Damaged / other' },
] as const;

export function WriteOffBatchDialog({
  batchId,
  productName,
  quantityRemaining,
}: {
  batchId: string;
  productName: string;
  quantityRemaining: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<(typeof REASONS)[number]['value']>('expired');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setQuantity('');
    setReason('expired');
    setNote('');
    setError(null);
  }

  async function onSubmit() {
    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > quantityRemaining) {
      setError(`Enter a whole number between 1 and ${quantityRemaining}.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/inventory/batches/${batchId}/write-off`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quantity: parsed, reason, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not write off this batch.');
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write off this batch.');
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
        <Button variant="outline" size="sm">
          Write off
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Write off — {productName}</DialogTitle>
          <DialogDescription>{quantityRemaining} remaining in this batch. This also reduces stock, if tracked.</DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="write-off-quantity">Quantity</Label>
            <Input
              id="write-off-quantity"
              type="number"
              min={1}
              max={quantityRemaining}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="0"
              aria-invalid={Boolean(error) || undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="write-off-reason">Reason</Label>
            <select
              id="write-off-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value as typeof reason)}
              className="flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="write-off-note">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="write-off-note" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onSubmit} loading={submitting}>
            Confirm write-off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
