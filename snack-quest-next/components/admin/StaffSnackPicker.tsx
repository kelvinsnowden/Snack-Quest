'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Check, Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface StaffSelectableSnack {
  id: string;
  name: string;
  origin: string | null;
  imageUrl: string | null;
  /** Null means untracked, never zero. */
  stockCount: number | null;
}

/**
 * Choosing a Premium box's guaranteed snacks while taking an order
 * (§ staff pick the snacks too).
 *
 * Deliberately *not* the customer's `GuaranteedPicker`, and the
 * difference is the point. That one shows photographs captioned by
 * origin and hides names on purpose — a customer is browsing, and the
 * packet in the picture already says what it is. A staff member is
 * doing the opposite job: someone is on the phone saying "the spicy
 * ramen one", and they need to find it by name, fast, among a
 * catalogue that only grows. Reusing the customer component here would
 * mean scrolling a wall of unlabelled photos during a live call.
 *
 * So this one is a searchable list carrying everything the customer's
 * deliberately withholds: the name, the origin, the stock — and the
 * photograph, because half of what a customer says is "the green one"
 * or "the one with the panda", and a column of names alone makes staff
 * read every row instead of glancing down it.
 *
 * Stock especially: staff are about to promise a specific snack out
 * loud and then pack it by hand, and "2 left" is the difference
 * between a promise they can keep and one they cannot.
 *
 * It also is not held to the customer's rules (§ staff are not
 * picking, they are packing). A customer on the website chooses
 * exactly five, from the snacks an admin opted in. A staff member is
 * writing a packing list from a phone call: any number, from anything
 * the shop actually has. The box's own number is still shown, as what
 * the website promises rather than as a limit.
 *
 * It still cannot name anything the server would refuse — the list is
 * the live catalogue filtered to what is active and in stock, and
 * every id is re-validated at checkout.
 */
export function StaffSnackPicker({
  suggested,
  max,
  selectedIds,
  onChange,
}: {
  /** What the box offers a customer on the website — a target here, never a cap. */
  suggested: number;
  /** The server's ceiling, so the picker cannot offer what it would refuse. */
  max: number;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [snacks, setSnacks] = useState<StaffSelectableSnack[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/premium-snacks')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('unavailable'))))
      .then((data: { snacks: StaffSelectableSnack[] }) => {
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
  const full = chosen >= max;

  // Name *and* origin, because both are things a customer says out
  // loud — "the Korean one" is as common as naming the snack.
  const matches = useMemo(() => {
    const all = snacks ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (snack) =>
        snack.name.toLowerCase().includes(needle) ||
        (snack.origin ?? '').toLowerCase().includes(needle),
    );
  }, [snacks, query]);

  // Chosen snacks stay visible while a search is filtering the rest,
  // so the operator can always see and undo what they have committed
  // to without clearing the box they are typing in.
  const selected = useMemo(
    () => (snacks ?? []).filter((snack) => selectedIds.includes(snack.id)),
    [snacks, selectedIds],
  );

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((current) => current !== id));
      return;
    }
    if (full) return;
    onChange([...selectedIds, id]);
  }

  if (failed) {
    return (
      <p className="border-border bg-surface text-muted-foreground rounded-lg border p-3 text-sm">
        Couldn&apos;t load the snack list. Reload the page and try again.
      </p>
    );
  }

  if (snacks === null) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading snacks…
      </p>
    );
  }

  /*
   * Fewer snacks opted in than the box requires. Said plainly, and
   * pointing at the fix, because the operator is the one person who
   * can actually resolve it — unlike the customer, who gets told to
   * message us.
   */
  /*
   * Nothing to pack from at all. Not a count check any more — staff
   * are not held to the box's number — so this only fires when the
   * catalogue itself is empty, and it points at the real fix rather
   * than at the customer-facing opt-in, which no longer gates this
   * list.
   */
  if (snacks.length === 0) {
    return (
      <p className="border-warning/40 bg-warning/10 text-foreground rounded-lg border p-3 text-sm">
        No snacks are in stock to pack. Add them in the Snack Catalogue, then reopen this.
      </p>
    );
  }

  return (
    <div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        {/*
          The box's number is shown as what the website promises, not
          as a limit — staff are recording what actually goes in the
          box and may name more or fewer.
        */}
        <p className="text-foreground text-sm font-semibold tabular-nums">
          {chosen} {chosen === 1 ? 'snack' : 'snacks'} chosen
          {suggested > 0 ? (
            <span className="text-muted-foreground font-normal"> · box includes {suggested}</span>
          ) : null}
        </p>
        {chosen > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* What is already committed, always visible regardless of the search. */}
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((snack) => (
            <li key={snack.id}>
              <button
                type="button"
                onClick={() => toggle(snack.id)}
                className="bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-caption font-medium"
              >
                <span className="bg-border/40 relative size-5 shrink-0 overflow-hidden rounded-full">
                  {snack.imageUrl ? (
                    <Image src={snack.imageUrl} alt="" fill sizes="20px" className="object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[10px]">🍬</span>
                  )}
                </span>
                {snack.name}
                <X className="size-3" aria-hidden="true" />
                <span className="sr-only">Remove {snack.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or origin — e.g. ramen, Korea"
          className="pl-9"
          aria-label="Search snacks"
        />
      </div>

      <ul className="max-h-64 overflow-y-auto">
        {matches.length === 0 ? (
          <li className="text-muted-foreground px-1 py-3 text-sm">
            Nothing matches “{query.trim()}”.
          </li>
        ) : (
          matches.map((snack) => {
            const isSelected = selectedIds.includes(snack.id);
            const blocked = full && !isSelected;
            const low = snack.stockCount !== null && snack.stockCount <= 3;

            return (
              <li key={snack.id}>
                <button
                  type="button"
                  onClick={() => toggle(snack.id)}
                  disabled={blocked}
                  aria-pressed={isSelected}
                  className={cn(
                    'hover:bg-border/40 flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition',
                    blocked && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    {/*
                      The packet, not just its name. Staff are matching
                      what a customer is describing out loud — "the
                      green one", "the one with the panda" — and a list
                      of names alone makes them read every row. The
                      selected tick sits on the image rather than
                      beside it, so the row stays one glance wide.
                    */}
                    <span className="bg-border/40 relative size-10 shrink-0 overflow-hidden rounded-md">
                      {snack.imageUrl ? (
                        <Image src={snack.imageUrl} alt="" fill sizes="40px" className="object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-lg">🍬</span>
                      )}
                      {isSelected ? (
                        <span className="bg-primary/85 absolute inset-0 flex items-center justify-center text-white">
                          <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                        </span>
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="text-foreground block truncate text-sm font-medium">
                        {snack.name}
                      </span>
                      {snack.origin ? (
                        <span className="text-muted-foreground block text-caption">{snack.origin}</span>
                      ) : null}
                    </span>
                  </span>
                  {/*
                    Only when it is actually counted and actually low.
                    An untracked snack says nothing rather than "0" —
                    the catalogue is mostly uncounted, and rendering
                    absent as none would mark almost everything as out
                    of stock.
                  */}
                  {low ? (
                    <span className="text-warning shrink-0 text-caption font-semibold tabular-nums">
                      {snack.stockCount} left
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
