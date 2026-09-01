'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, ChevronDown, Loader2, Lock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
 * Collapsed until asked for. The grid is the biggest thing on the
 * checkout when it is open, and a customer who has already decided —
 * or who is buying a box that offers picks without caring about them —
 * should not have to scroll past every snack to reach the payment
 * button. Open, choose, close, pay.
 *
 * Shows what is genuinely pickable and nothing else: the list arrives
 * from the server already filtered to snacks an admin opted in, that
 * are active and in stock, so this component cannot offer something
 * the server would refuse.
 *
 * Deliberately not a cart — no quantity, no running total, and the
 * remainder of the box is stated as a surprise on the same screen.
 * The moment this reads as "build your own box" the product stops
 * being Snack Quest.
 */
/**
 * One snack in the grid, memoized (§ picker responsiveness).
 *
 * The grid is 62 cards, each with an image, and it lives inside a
 * 1,400-line form holding 23 pieces of state. Without this, every
 * keystroke in the address field and every tap on any snack re-rendered
 * all 62 — which is what a customer felt as lag.
 *
 * The props are deliberately primitives. Handing each card the whole
 * `selectedIds` array would change every card's props whenever any one
 * of them was tapped, and `memo` would compare unequal every time.
 */
const SnackCard = memo(function SnackCard({
  snack,
  position,
  total,
  selected,
  blocked,
  onToggle,
}: {
  snack: SelectableSnack;
  /** 1-based, for a label that tells the cards apart without naming them. */
  position: number;
  total: number;
  selected: boolean;
  blocked: boolean;
  /** Stable for the life of the picker; see `toggle`. */
  onToggle: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(snack.id)}
        disabled={blocked}
        aria-pressed={selected}
        /*
         * Distinguishable without naming the snack.
         *
         * The name used to be the label, on the reasoning that a
         * screen-reader user has no packet in a photo to read off. The
         * product decision is that individual snacks are not named to
         * customers anywhere, and an announced label is somewhere. A
         * position plus an origin keeps the buttons tellable apart —
         * "snack 4 of 62, Japan" — which is what the label was for.
         */
        aria-label={
          snack.origin
            ? `Snack ${position} of ${total}, ${snack.origin}`
            : `Snack ${position} of ${total}`
        }
        className={cn(
          'flex h-full w-full flex-col overflow-hidden rounded-lg border text-left transition',
          selected ? 'border-primary ring-primary/30 ring-2' : 'border-border hover:border-foreground/30',
          blocked && 'cursor-not-allowed opacity-40',
        )}
      >
        <span className="bg-border/40 relative block aspect-square w-full overflow-hidden">
          {snack.imageUrl ? (
            <Image
              src={snack.imageUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 140px, 30vw"
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-2xl">🍬</span>
          )}
          {selected ? (
            <span className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full">
              <Check className="size-3" strokeWidth={3} aria-hidden="true" />
            </span>
          ) : (
            <span className="text-foreground/70 absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-white/90">
              <Plus className="size-3" strokeWidth={3} aria-hidden="true" />
            </span>
          )}
        </span>

        {/* Origin only — the packet in the photo already carries the name. */}
        {snack.origin ? (
          <span
            className={cn(
              'block px-2 py-1.5 text-center text-caption font-medium',
              selected ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {snack.origin}
          </span>
        ) : null}
      </button>
    </li>
  );
});

/**
 * Memoized as a whole, on top of the per-card memo.
 *
 * The picker sits in a form holding 23 pieces of state, so without
 * this every keystroke in the name, phone or address field re-rendered
 * the entire grid. Typing an address should not cost 62 image cards.
 */
export const GuaranteedPicker = memo(function GuaranteedPicker({
  required,
  selectedIds,
  onChange,
}: {
  required: number;
  selectedIds: string[];
  /**
   * Reports the chosen snacks, not only their ids.
   *
   * The names are already loaded here and nowhere else, and the order
   * summary needs them so a customer can check their five picks
   * without scrolling back up to this grid.
   */
  onChange: (ids: string[], snacks: SelectableSnack[]) => void;
}) {
  const [snacks, setSnacks] = useState<SelectableSnack[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

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

  /*
   * Close the grid the moment the last pick lands.
   *
   * Choosing is finished at that point, and leaving 62 cards open
   * under a customer who is done pushes the rest of the checkout a
   * screen further down for no reason. The header collapses to "your 5
   * picks are locked in", which is the summary they want instead.
   *
   * Armed by *how the grid was opened*, not by the count changing.
   * Watching for the transition into full is not enough: a customer
   * who reopens a finished set to swap a snack removes one — which
   * resets that — and then adds one, passing back through full and
   * slamming the grid shut mid-edit, every single time.
   *
   * So it only auto-closes a session that began with picks still to
   * make. Reopen a complete set and it stays open for as long as you
   * are editing it.
   */
  const autoCloseArmed = useRef(false);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      // Opened just now: arm only if there is still choosing to do.
      autoCloseArmed.current = !full;
    }
    wasOpen.current = open;
  }, [open, full]);

  /*
   * Collapsing alone is not enough, and on its own it is disorienting.
   *
   * The customer is usually scrolled deep inside the grid when the
   * fifth pick lands. Removing sixty-odd cards from above them keeps
   * their scroll offset but changes what is at it, so they surface
   * somewhere further down the form with the picker far above and no
   * idea what just happened.
   *
   * Scrolling the header back into view lands them on "your 5 picks
   * are locked in" with the next section directly beneath — which is
   * the point of collapsing at all.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && full && autoCloseArmed.current) {
      autoCloseArmed.current = false;
      setOpen(false);
      // Optional-called: scrolling is a courtesy, and an environment
      // without it must not throw out of a state update.
      rootRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }
  }, [open, full]);
  // O(1) per card instead of a linear scan. Small on its own, but it
  // runs 62 times per render and the whole point here is that a tap
  // costs as little as possible.
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selected = useMemo(
    () => (snacks ?? []).filter((snack) => selectedSet.has(snack.id)),
    [snacks, selectedSet],
  );

  /*
   * Read through refs so `toggle` can be stable for the life of the
   * picker.
   *
   * This is the part that makes the memo above actually work. A
   * `useCallback` depending on `selectedIds` and `full` would get a new
   * identity on every tap, every card's `onToggle` prop would compare
   * unequal, and all 62 would re-render again — exactly the cost the
   * memo was added to remove.
   */
  const stateRef = useRef({ selectedIds, full, onChange, snacks });
  // In an effect, not during render, for the same reason: a ref write
  // mid-render is forbidden, and an effect has flushed before any tap.
  useEffect(() => {
    stateRef.current = { selectedIds, full, onChange, snacks };
  });

  const toggle = useCallback((id: string) => {
    const { selectedIds: current, full: isFull, onChange: notify, snacks: loaded } = stateRef.current;
    const resolve = (ids: string[]) =>
      ids
        .map((wanted) => (loaded ?? []).find((snack) => snack.id === wanted))
        .filter((snack): snack is SelectableSnack => Boolean(snack));

    if (current.includes(id)) {
      const next = current.filter((existing) => existing !== id);
      notify(next, resolve(next));
      return;
    }
    if (isFull) {
      return;
    }
    const next = [...current, id];
    notify(next, resolve(next));
  }, []);

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

  /*
   * Fewer snacks on offer than the box asks for. Without this the
   * customer would select every card, still be one short, and find the
   * pay button refusing them with nothing on screen explaining why —
   * the checkout requires exactly `required` picks and the picker
   * cannot supply them. Says so instead, and points at the one route
   * that still works.
   */
  if (snacks.length < required) {
    return (
      <p className="border-border bg-surface text-muted-foreground rounded-lg border p-4 text-sm">
        {snacks.length === 0
          ? 'No snacks are open for picking at the moment.'
          : `Only ${snacks.length} of the ${required} snacks you need to choose are available right now.`}{' '}
        Message us on WhatsApp and we&apos;ll sort you out.
      </p>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        'overflow-hidden rounded-xl border',
        full ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface',
      )}
    >
      {/*
        The summary is the control. Closed it states where the customer
        got to; open it turns into the way back out, so there is never
        a grid on screen without an obvious way to dismiss it.
      */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span
            className="text-foreground block text-sm font-semibold tabular-nums"
            // Announced, so the count reaching 5 is heard and not only
            // seen.
            aria-live="polite"
          >
            {full ? (
              <span className="text-primary inline-flex items-center gap-1.5">
                <Lock className="size-4" aria-hidden="true" />
                Your {required} picks are locked in
              </span>
            ) : (
              `${chosen} of ${required} chosen`
            )}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-sm">
            {open
              ? 'Tap a snack to choose it. Tap again to remove it.'
              : full
                ? 'Tap to change them.'
                : `Tap to choose ${required - chosen} more.`}
          </span>
        </span>

        {/* Closed, the thumbnails say what was picked without needing
            names — the same reasoning as the captions. */}
        {!open && selected.length > 0 ? (
          <span className="flex shrink-0 -space-x-2">
            {selected.slice(0, 5).map((snack) => (
              <span
                key={snack.id}
                className="border-surface bg-border/40 relative size-8 overflow-hidden rounded-full border-2"
              >
                {snack.imageUrl ? (
                  <Image src={snack.imageUrl} alt="" fill sizes="32px" className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs">🍬</span>
                )}
              </span>
            ))}
          </span>
        ) : null}

        <ChevronDown
          className={cn('text-muted-foreground size-5 shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="border-border flex flex-col gap-4 border-t p-4">
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {snacks.map((snack, index) => (
              <SnackCard
                key={snack.id}
                snack={snack}
                position={index + 1}
                total={snacks.length}
                // Primitives, so a card re-renders only when its own
                // state changes. Passing `selectedIds` down instead
                // would change every card's props on every tap and
                // defeat the memo entirely.
                selected={selectedSet.has(snack.id)}
                blocked={full && !selectedSet.has(snack.id)}
                onToggle={toggle}
              />
            ))}
          </ul>

          <Button
            type="button"
            variant={full ? 'primary' : 'outline'}
            onClick={() => setOpen(false)}
            className="self-start"
          >
            {full ? 'Done — back to checkout' : `Close (${chosen} of ${required} chosen)`}
          </Button>
        </div>
      ) : null}
    </div>
  );
});
