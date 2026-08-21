'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ImageOff, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SerializedShoppingRun, SerializedShoppingRunLine } from '@/lib/recipes/serialize';

/**
 * The screen someone actually shops from (§ Box Recipes).
 *
 * Every choice here answers the same question: this is being used
 * one-handed, standing up, possibly in a noisy market, by someone who
 * would rather be finished.
 *
 * - Ticking a line is a full-card tap, not a checkbox. The card is the
 *   target because a thumb is not a mouse pointer.
 * - Bought lines drop to the bottom and dim, so the remaining work is
 *   always what is under your thumb rather than something to scroll for.
 * - Prices are only asked for after a line is ticked. Asking up front
 *   puts two number fields in front of someone who has not bought
 *   anything yet, which is how a list stops being read.
 * - Every write is optimistic and independent. A dropped signal at a
 *   market stall must not lose the last five ticks, and nothing here
 *   blocks on a spinner before you can tick the next thing.
 */
export function ShoppingRunList({ run }: { run: SerializedShoppingRun }) {
  const router = useRouter();
  const [lines, setLines] = useState(run.lines);
  const [actualTotalKes, setActualTotalKes] = useState(run.actualTotalKes);
  const [error, setError] = useState<string | null>(null);
  const closed = run.status === 'completed';

  async function patch(snackItemId: string, patchBody: Record<string, unknown>, optimistic: (line: SerializedShoppingRunLine) => SerializedShoppingRunLine) {
    setLines((prev) => prev.map((line) => (line.snackItemId === snackItemId ? optimistic(line) : line)));
    setError(null);
    try {
      const response = await fetch(`/api/warehouse/shopping-runs/${run.id}/lines`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snackItemId, ...patchBody }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        actualTotalKes?: number;
        lines?: SerializedShoppingRunLine[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'Could not save that.');
      }
      if (typeof data.actualTotalKes === 'number') {
        setActualTotalKes(data.actualTotalKes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
      // Put the server's version back rather than leaving a tick that
      // did not persist — a list that lies about what is in the basket
      // is worse than one that admits it lost the change.
      router.refresh();
    }
  }

  const remaining = lines.filter((line) => !line.purchased);
  const bought = lines.filter((line) => line.purchased);
  const ordered = [...remaining, ...bought];

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Card className="flex items-start gap-2.5 border-danger/40 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-foreground">{error}</p>
        </Card>
      ) : null}

      <Card className="flex items-center justify-between gap-4 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-caption text-muted-foreground">Left to buy</span>
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {remaining.length}
            <span className="text-base font-normal text-muted-foreground">/{lines.length}</span>
          </span>
        </div>
        <div className="flex flex-col gap-0.5 text-right">
          <span className="text-caption text-muted-foreground">Spent / budget</span>
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {actualTotalKes.toLocaleString()}
            <span className="text-muted-foreground"> / {run.expectedTotalKes.toLocaleString()}</span>
          </span>
        </div>
      </Card>

      <ul className="flex flex-col gap-2.5">
        {ordered.map((line) => (
          <li key={line.snackItemId}>
            <LineCard
              line={line}
              disabled={closed}
              onToggle={() =>
                patch(line.snackItemId, { purchased: !line.purchased }, (current) => ({
                  ...current,
                  purchased: !current.purchased,
                }))
              }
              onRecord={(actualUnitCostKes, actualQuantity) =>
                patch(line.snackItemId, { actualUnitCostKes, actualQuantity }, (current) => ({
                  ...current,
                  actualUnitCostKes,
                  actualQuantity,
                }))
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function LineCard({
  line,
  disabled,
  onToggle,
  onRecord,
}: {
  line: SerializedShoppingRunLine;
  disabled: boolean;
  onToggle: () => void;
  onRecord: (actualUnitCostKes: number | null, actualQuantity: number | null) => void;
}) {
  const [price, setPrice] = useState(line.actualUnitCostKes === null ? '' : String(line.actualUnitCostKes));
  const [quantity, setQuantity] = useState(line.actualQuantity === null ? String(line.quantityNeeded) : String(line.actualQuantity));

  const short = line.actualQuantity !== null && line.actualQuantity < line.quantityNeeded;

  return (
    <Card className={`flex flex-col gap-3 p-3 ${line.purchased ? 'opacity-60' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={line.purchased}
        className="flex items-center gap-3 text-left disabled:cursor-not-allowed"
      >
        <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-border/30">
          {line.imageUrlSnapshot ? (
            <Image src={line.imageUrlSnapshot} alt={line.nameSnapshot} fill sizes="80px" className="object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageOff className="size-5" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className={`font-semibold leading-tight text-foreground ${line.purchased ? 'line-through' : ''}`}>
            {line.nameSnapshot}
          </p>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">
              {line.quantityNeeded} {line.unitLabelSnapshot}
              {line.quantityNeeded === 1 ? '' : 's'}
            </span>{' '}
            · about KES <span className="tabular-nums">{line.expectedUnitCostKes.toLocaleString()}</span> each
          </p>
          {line.sourcingNoteSnapshot ? (
            <p className="flex items-start gap-1 text-caption text-muted-foreground">
              <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              <span>{line.sourcingNoteSnapshot}</span>
            </p>
          ) : null}
          {short ? (
            <p className="text-caption font-medium text-warning">
              Got {line.actualQuantity} of {line.quantityNeeded}
            </p>
          ) : null}
        </div>

        <span
          aria-hidden="true"
          className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 ${
            line.purchased ? 'border-success bg-success text-white' : 'border-border text-transparent'
          }`}
        >
          <Check className="size-5" />
        </span>
      </button>

      {line.purchased && !disabled ? (
        <div className="flex items-end gap-2 border-t border-border pt-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-caption text-muted-foreground">Paid each (KES)</span>
            <Input
              inputMode="numeric"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder={String(line.expectedUnitCostKes)}
              className="min-h-11 tabular-nums"
            />
          </label>
          <label className="flex w-24 flex-col gap-1">
            <span className="text-caption text-muted-foreground">Got</span>
            <Input
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="min-h-11 tabular-nums"
            />
          </label>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() =>
              onRecord(price.trim() === '' ? null : Number(price), quantity.trim() === '' ? null : Number(quantity))
            }
          >
            Save
          </Button>
        </div>
      ) : null}

      {line.purchased && disabled && line.actualUnitCostKes !== null ? (
        <p className="border-t border-border pt-2 text-caption text-muted-foreground">
          Paid KES <span className="tabular-nums">{line.actualUnitCostKes.toLocaleString()}</span> each ×{' '}
          <span className="tabular-nums">{line.actualQuantity}</span>
        </p>
      ) : null}
    </Card>
  );
}
