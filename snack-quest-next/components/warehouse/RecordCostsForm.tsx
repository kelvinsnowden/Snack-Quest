'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * What this box cost to fulfil, entered by the person who packed it
 * (§ fulfilment records the real cost).
 *
 * Two fields rather than one because they answer different questions
 * at the till: the snacks are cost of goods, and the packaging and the
 * Bolt to the door are not. A single "total spent" box would collapse
 * a margin report into a number nobody can act on.
 *
 * Shows the resulting margin as it is typed. The packer is the only
 * person holding the receipts, and seeing an impossible margin appear
 * is the fastest way to catch a slipped digit — which is also why an
 * empty form is refused rather than saved as zero.
 */
export function RecordCostsForm({
  orderId,
  revenueKes,
  existing,
}: {
  orderId: string;
  /** What the customer pays — the other half of the margin. */
  revenueKes: number;
  existing?: { goodsCostKes: number; otherCostKes: number; note: string | null } | null;
}) {
  const router = useRouter();
  const [goods, setGoods] = useState(existing ? String(existing.goodsCostKes) : '');
  const [other, setOther] = useState(existing ? String(existing.otherCostKes) : '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const goodsKes = Number.parseInt(goods, 10);
  const otherKes = Number.parseInt(other, 10);
  const totalCost = (Number.isFinite(goodsKes) ? goodsKes : 0) + (Number.isFinite(otherKes) ? otherKes : 0);
  const ready = totalCost > 0 && !submitting;
  const margin = revenueKes - totalCost;

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/warehouse/orders/${orderId}/costs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          goodsCostKes: goods || 0,
          otherCostKes: other || 0,
          note: note.trim() || null,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? 'Could not save these costs.');
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save these costs.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`goods-${orderId}`}>Snacks cost</Label>
          <Input
            id={`goods-${orderId}`}
            inputMode="numeric"
            value={goods}
            onChange={(event) => setGoods(event.target.value.replace(/[^0-9]/g, ''))}
            placeholder="0"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`other-${orderId}`}>Everything else</Label>
          <Input
            id={`other-${orderId}`}
            inputMode="numeric"
            value={other}
            onChange={(event) => setOther(event.target.value.replace(/[^0-9]/g, ''))}
            placeholder="0"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`note-${orderId}`}>Note (optional)</Label>
        <Input
          id={`note-${orderId}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Bolt to Kilimani, extra bubble wrap"
        />
      </div>

      {/*
        The consequence of what has just been typed, in money. A margin
        that reads wrong here is a slipped digit caught before it
        reaches a report.
      */}
      {totalCost > 0 ? (
        <p className="text-muted-foreground text-sm tabular-nums">
          Cost KES {totalCost.toLocaleString()} against KES {revenueKes.toLocaleString()} —{' '}
          <span className={margin < 0 ? 'text-danger font-semibold' : 'text-foreground font-medium'}>
            {margin < 0 ? '-' : ''}KES {Math.abs(margin).toLocaleString()}{' '}
            {margin < 0 ? 'loss' : 'margin'}
          </span>
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={onSubmit} disabled={!ready} loading={submitting}>
          {existing ? 'Update costs' : 'Save costs'}
        </Button>
        {saved && !error ? <span className="text-success text-sm">Saved.</span> : null}
      </div>
      {error ? <p className="text-danger text-sm">{error}</p> : null}
    </div>
  );
}
