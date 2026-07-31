'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import type { InventoryMovementReason } from '@/types';

const REASONS: { value: InventoryMovementReason; label: string }[] = [
  { value: 'restock', label: 'Restock' },
  { value: 'correction', label: 'Correction' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'other', label: 'Other' },
];

export function InventoryAdjustDialog({
  packageId,
  productName,
  currentStock,
}: {
  packageId: string;
  productName: string;
  currentStock: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<InventoryMovementReason>('restock');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDirection('add');
    setQuantity('');
    setReason('restock');
    setNote('');
    setError(null);
  }

  async function onSubmit() {
    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError('Enter a whole number greater than zero.');
      return;
    }
    const delta = direction === 'add' ? parsed : -parsed;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/inventory/${packageId}/adjust`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ delta, reason, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not adjust stock.');
      }
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not adjust stock.');
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
          Adjust
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock — {productName}</DialogTitle>
          <DialogDescription>Currently {currentStock} in stock. Every adjustment is recorded.</DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDirection('add')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                direction === 'add'
                  ? 'border-success bg-success/10 text-success'
                  : 'border-border text-muted-foreground hover:bg-border/30',
              )}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add
            </button>
            <button
              type="button"
              onClick={() => setDirection('remove')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                direction === 'remove'
                  ? 'border-danger bg-danger/10 text-danger'
                  : 'border-border text-muted-foreground hover:bg-border/30',
              )}
            >
              <Minus className="size-4" aria-hidden="true" />
              Remove
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="0"
              aria-invalid={Boolean(error) || undefined}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Reason</Label>
            <select
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value as InventoryMovementReason)}
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
            <Label htmlFor="note">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Delivery from supplier" />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={submitting}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
