'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { StaffSnackPicker } from '@/components/admin/StaffSnackPicker';
import { MAX_STAFF_PICKS } from '@/lib/packages/guaranteedPicks';

export interface BoxToComplete {
  lineIndex: number;
  packageLabel: string;
  quantity: number;
  /** What the customer chose — shown, never editable here. */
  promisedCount: number;
  /** What the shop has already recorded putting in, by snack id. */
  curatedSnackIds: string[];
}

/**
 * The rest of what goes in each box, recorded by the shop
 * (§ staff complete the box).
 *
 * A customer choosing five snacks is choosing a floor, not the
 * contents — the box holds far more, and the rest is curation nobody
 * can know until somebody is standing over it. This is where that gets
 * written down, on the same card as the packing it describes.
 *
 * The customer's own picks are deliberately not editable here. They
 * are a promise made at checkout, and a screen that let a packer
 * quietly rewrite them would turn "guaranteed" into "whatever we
 * happened to have".
 */
export function CompleteBoxForm({
  orderId,
  boxes,
}: {
  orderId: string;
  boxes: BoxToComplete[];
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<number, string[]>>(
    Object.fromEntries(boxes.map((box) => [box.lineIndex, box.curatedSnackIds])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const total = Object.values(selection).reduce((sum, ids) => sum + ids.length, 0);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/warehouse/orders/${orderId}/curated-snacks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: boxes.map((box) => ({
            lineIndex: box.lineIndex,
            snackItemIds: selection[box.lineIndex] ?? [],
          })),
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? 'Could not save what went in.');
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save what went in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {boxes.map((box) => (
        <div key={box.lineIndex} className="flex flex-col gap-2">
          <p className="text-foreground text-sm font-medium">
            {box.quantity} × {box.packageLabel}
          </p>
          <p className="text-muted-foreground text-caption">
            {box.promisedCount > 0
              ? `The customer chose ${box.promisedCount}. Add the rest of what you put in — those ${box.promisedCount} are already on the list above.`
              : 'Nothing was chosen by the customer. Record what you put in.'}
          </p>
          <StaffSnackPicker
            suggested={0}
            max={MAX_STAFF_PICKS}
            selectedIds={selection[box.lineIndex] ?? []}
            onChange={(ids) =>
              setSelection((current) => ({ ...current, [box.lineIndex]: ids }))
            }
          />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={onSubmit} loading={submitting} disabled={submitting}>
          {total > 0 ? `Save ${total} ${total === 1 ? 'snack' : 'snacks'}` : 'Save'}
        </Button>
        {saved && !error ? <span className="text-success text-sm">Saved.</span> : null}
      </div>
      {error ? <p className="text-danger text-sm">{error}</p> : null}
    </div>
  );
}
