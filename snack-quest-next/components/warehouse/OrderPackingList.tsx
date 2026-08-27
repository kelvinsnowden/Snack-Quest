import Image from 'next/image';
import { MapPin } from 'lucide-react';
import { orderLines, type CheckoutLineItem } from '@/types/checkoutLine';
import type { GuaranteedPick } from '@/types';

/**
 * What actually goes in the boxes, on the screen of the person packing
 * them (§ Warehouse workspace).
 *
 * Photograph-led, and that is the whole point rather than decoration.
 * This catalogue is imported, so a snack's name in the system is
 * whatever shorthand the buyer typed — "D 2", "SK 12", "N17". Nobody
 * can pick those off a shelf. The packet in the picture is the only
 * thing that identifies the product, so the picture is the primary
 * content and the name is the caption.
 *
 * A snack with no photograph is called out rather than quietly given a
 * placeholder: it is the one row the packer cannot act on, and the fix
 * (add the photo in the Snack Catalogue) belongs to someone who needs
 * to know it is missing.
 *
 * Every line is listed even when there is one, and the named snacks
 * sit under the box they belong to rather than in one list for the
 * order — two boxes can each have their own, and a flat list would not
 * say which packet goes where.
 *
 * Stated as a floor, never as the contents: the rest of the box is
 * still curated, and a packer reading these as "the box contains
 * exactly these" would ship a worse box.
 *
 * Where to buy each one comes from the live catalogue rather than the
 * order, deliberately. `GuaranteedPick` freezes the name and photo
 * because an order records what was sold; a sourcing note is the
 * opposite kind of fact — it answers "where do I get this today", and
 * a shop that moved supplier last month needs the packer to be told
 * the new one, not the one that was true when the order was placed.
 */
export function OrderPackingList({
  product,
  sourcingNotes,
  /** Bigger squares for the order page, where the packer is working from one order. */
  size = 'compact',
}: {
  product: {
    items?: CheckoutLineItem[];
    packageId: string;
    packageLabel: string;
    quantity?: number;
    guaranteedPicks?: GuaranteedPick[];
  };
  /** Where to buy each snack, by snack id — read live, see this component's own note. */
  sourcingNotes?: Map<string, string | null>;
  size?: 'compact' | 'large';
}) {
  const lines = orderLines(product);

  /*
   * An order written before picks moved onto the line carries them at
   * the top instead. Those are real, paid, and still get packed, so
   * they are read onto the first line rather than dropped.
   */
  const picksFor = (line: CheckoutLineItem, index: number): GuaranteedPick[] => {
    if (line.guaranteedPicks?.length) {
      return line.guaranteedPicks;
    }
    const noneOnAnyLine = lines.every((candidate) => !candidate.guaranteedPicks?.length);
    return index === 0 && noneOnAnyLine ? (product.guaranteedPicks ?? []) : [];
  };

  const tile = size === 'large' ? 'size-24' : 'size-16';
  const sizes = size === 'large' ? '96px' : '64px';

  return (
    <ul className="flex flex-col gap-4">
      {lines.map((line, index) => {
        const picks = picksFor(line, index);
        return (
          <li key={`${line.packageId}-${index}`}>
            <span className="text-foreground block font-medium">
              {line.quantity} × {line.packageLabel}
            </span>
            {picks.length > 0 ? (
              <>
                <span className="text-muted-foreground mt-0.5 block text-caption">
                  Must include:
                </span>
                <ul className="mt-2 flex flex-wrap gap-3">
                  {picks.map((pick) => (
                    <li key={pick.snackItemId} className="w-[5.5rem] shrink-0">
                      <span
                        className={`bg-border/40 relative block ${tile} w-full overflow-hidden rounded-md`}
                      >
                        {pick.imageUrl ? (
                          <Image
                            src={pick.imageUrl}
                            alt={pick.name}
                            fill
                            sizes={sizes}
                            className="object-cover"
                          />
                        ) : (
                          <span className="text-warning flex h-full w-full items-center justify-center px-1 text-center text-caption font-medium">
                            No photo
                          </span>
                        )}
                      </span>
                      <span className="text-foreground mt-1 block text-caption leading-tight font-medium">
                        {pick.name}
                      </span>
                      {pick.origin ? (
                        <span className="text-muted-foreground block text-caption leading-tight">
                          {pick.origin}
                        </span>
                      ) : null}
                      {/*
                        Where to buy it. The same pin the shopping run
                        uses, so the two screens read as one system to
                        somebody who moves between them.
                      */}
                      {sourcingNotes?.get(pick.snackItemId) ? (
                        <span className="text-foreground mt-0.5 flex items-start gap-1 text-caption leading-tight">
                          <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                          <span>{sourcingNotes.get(pick.snackItemId)}</span>
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
