'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Check, Loader2, Lock, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectableSnack {
  id: string;
  name: string;
  origin: string | null;
  imageUrl: string | null;
}

/**
 * "Choose your 5 guaranteed picks" (§ Premium: choose 5, discover the
 * rest).
 *
 * The point of the box, so it is a step in the checkout rather than a
 * separate page: the existing checkout is one form with numbered
 * sections, and sending a customer away to a second screen and back
 * would put a navigation in the middle of a funnel that currently has
 * none.
 *
 * It shows what is genuinely pickable and nothing else. The list comes
 * from the server already filtered to snacks an admin opted in, that
 * are active and in stock — this component never sees the rest of the
 * catalogue, so it cannot offer something the server would refuse.
 *
 * Deliberately not a cart. There is no quantity, no running total, and
 * the remainder of the box is stated as a surprise on the same screen,
 * because the moment this reads as "build your own box" the product
 * stops being Snack Quest.
 */
export function GuaranteedPicker({
  required,
  selectedIds,
  onChange,
}: {
  required: number;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [snacks, setSnacks] = useState<SelectableSnack[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/premium-snacks')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('unavailable'))))
      .then((data: { snacks: SelectableSnack[] }) => {
        if (!cancelled) setSnacks(data.snacks ?? []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chosen = selectedIds.length;
  const full = chosen >= required;

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((selected) => selected !== id));
      return;
    }
    // Silently ignoring a tap once full would read as a broken button.
    // The cards say why instead — see `disabled` below.
    if (full) {
      return;
    }
    onChange([...selectedIds, id]);
  }

  if (failed) {
    return (
      <p className="border-border bg-surface text-muted-foreground rounded-lg border p-4 text-sm">
        We couldn&apos;t load the snack list just now. Refresh the page to try again.
      </p>
    );
  }

  if (snacks === null) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 p-4 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading the current selection…
      </p>
    );
  }

  if (snacks.length === 0) {
    // Honest rather than an empty grid: nothing is pickable right now,
    // and the checkout below will refuse the order anyway.
    return (
      <p className="border-border bg-surface text-muted-foreground rounded-lg border p-4 text-sm">
        No snacks are open for picking at the moment. Message us on WhatsApp and we&apos;ll sort you
        out.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3',
          full ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface',
        )}
      >
        <p
          className="text-foreground text-sm font-semibold tabular-nums"
          // Announced so a screen-reader user hears the count change
          // rather than only seeing it.
          aria-live="polite"
        >
          {full ? (
            <span className="text-primary inline-flex items-center gap-1.5">
              <Lock className="size-4" aria-hidden="true" />
              Your picks are locked in
            </span>
          ) : (
            `${chosen} / ${required} selected`
          )}
        </p>
        <p className="text-muted-foreground text-sm">
          {full ? 'Now let us handle the surprises.' : `Pick ${required - chosen} more`}
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {snacks.map((snack) => {
          const selected = selectedIds.includes(snack.id);
          // Full and not this one: it cannot be added until something
          // is removed, and the card says so rather than going dead.
          const blocked = full && !selected;

          return (
            <li key={snack.id}>
              <button
                type="button"
                onClick={() => toggle(snack.id)}
                disabled={blocked}
                aria-pressed={selected}
                className={cn(
                  'flex h-full w-full flex-col overflow-hidden rounded-xl border text-left transition',
                  selected
                    ? 'border-primary bg-primary/5 ring-primary/30 ring-2'
                    : 'border-border bg-surface hover:bg-border/30',
                  blocked && 'cursor-not-allowed opacity-50',
                )}
              >
                <span className="bg-border/40 relative block aspect-square w-full overflow-hidden">
                  {snack.imageUrl ? (
                    <Image
                      src={snack.imageUrl}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 200px, 45vw"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-3xl">🍬</span>
                  )}
                  {selected ? (
                    <span className="bg-primary text-primary-foreground absolute top-2 right-2 flex size-6 items-center justify-center rounded-full">
                      <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                    </span>
                  ) : null}
                </span>

                <span className="flex flex-1 flex-col gap-1 p-3">
                  <span className="text-foreground text-sm leading-snug font-medium">{snack.name}</span>
                  {snack.origin ? (
                    <span className="text-muted-foreground text-caption">{snack.origin}</span>
                  ) : null}
                  <span
                    className={cn(
                      'mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold',
                      selected ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {selected ? (
                      <>
                        <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                        Selected
                      </>
                    ) : (
                      <>
                        <Plus className="size-4" aria-hidden="true" />
                        Select
                      </>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {full ? (
        <p className="text-muted-foreground text-sm">
          Want to swap one? Tap a selected snack to remove it.
        </p>
      ) : null}
    </div>
  );
}
