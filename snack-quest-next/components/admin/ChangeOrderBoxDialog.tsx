'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatKes } from '@/lib/orders/format';

export interface BoxChoice {
  id: string;
  name: string;
  priceKes: number;
}

/**
 * Changes which box a paid order is for (§ correcting the box on an
 * order) — the wrong one picked while recording a sale by hand.
 *
 * Shows what the new total will be before the change is made, because
 * the consequence is not obvious: the money already received does not
 * move, so a different-priced box leaves a balance somebody has to
 * collect or refund. Better to see that in advance than to discover it
 * on the order afterwards.
 */
export function ChangeOrderBoxDialog({
  orderId,
  boxes,
  currentPackageId,
  currentQuantity,
  amountPaidKes,
  deliveryFeeKes,
  discountKes,
  creditsUsedKes,
}: {
  orderId: string;
  boxes: BoxChoice[];
  currentPackageId: string;
  currentQuantity: number;
  amountPaidKes: number;
  deliveryFeeKes: number;
  discountKes: number;
  creditsUsedKes: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [packageId, setPackageId] = useState(currentPackageId);
  const [quantity, setQuantity] = useState(String(currentQuantity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = boxes.find((box) => box.id === packageId);
  const parsedQuantity = Number.parseInt(quantity, 10);
  const validQuantity = Number.isFinite(parsedQuantity) && parsedQuantity >= 1;
  const newTotal = chosen && validQuantity
    ? chosen.priceKes * parsedQuantity - discountKes - creditsUsedKes + deliveryFeeKes
    : null;
  const balance = newTotal === null ? null : amountPaidKes - newTotal;

  async function submit() {
    if (!validQuantity) {
      setError('Quantity must be at least 1.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/box`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId, quantity: parsedQuantity }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? `The change failed (HTTP ${response.status}).`);
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The change failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="mt-3">
        <Package className="size-4" aria-hidden="true" />
        Change the box
      </Button>
    );
  }

  return (
    <div className="border-border bg-surface mt-3 flex flex-col gap-3 rounded-xl border p-4">
      <div>
        <p className="text-foreground text-sm font-semibold">Change the box</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Moves stock to match. The amount already paid does not change, so a different price leaves
          a balance to settle.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="change-box">Box</Label>
        <select
          id="change-box"
          value={packageId}
          onChange={(event) => setPackageId(event.target.value)}
          className="border-border bg-background text-foreground h-10 rounded-md border px-3 text-sm"
        >
          {boxes.map((box) => (
            <option key={box.id} value={box.id}>
              {box.name} — {formatKes(box.priceKes)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="change-quantity">Quantity</Label>
        <Input
          id="change-quantity"
          type="number"
          min={1}
          inputMode="numeric"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className="max-w-28"
        />
      </div>

      {newTotal !== null && balance !== null ? (
        <div className="border-border rounded-lg border border-dashed p-3">
          <p className="text-muted-foreground text-sm">
            New total <span className="text-foreground font-medium">{formatKes(newTotal)}</span> ·
            paid <span className="text-foreground font-medium">{formatKes(amountPaidKes)}</span>
          </p>
          {balance === 0 ? (
            <p className="text-success mt-1 text-sm font-medium">Settled — nothing left to collect.</p>
          ) : balance < 0 ? (
            <p className="text-warning mt-1 text-sm font-medium">
              Customer still owes {formatKes(Math.abs(balance))}.
            </p>
          ) : (
            <p className="text-warning mt-1 text-sm font-medium">
              Customer overpaid by {formatKes(balance)} — refund due.
            </p>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="text-danger flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={submit} loading={busy} size="sm">
          Save change
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
