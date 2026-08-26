import { orderLines, type CheckoutLineItem } from '@/types/checkoutLine';
import type { GuaranteedPick } from '@/types';

/**
 * What actually goes in the boxes, on the screen of the person packing
 * them (§ Warehouse workspace).
 *
 * The queue used to name the boxes and stop there — "Premium Box", and
 * the packer had to go and find out the rest. That was survivable
 * while nothing on an order named individual snacks. It stopped being
 * survivable when staff started writing packing lists by phone: an
 * order can now carry specific snacks, chosen for a specific box, and
 * a screen that shows only the box name silently drops them.
 *
 * Every line is listed even when there is one, and the named snacks
 * sit under the box they belong to rather than in one list for the
 * order — two boxes can each have their own, and a flat list would not
 * say which packet goes where.
 *
 * Stated as a floor, never as the contents: the rest of the box is
 * still curated, and a packer reading five names as "the box contains
 * these five" would ship a worse box.
 */
export function OrderPackingList({
  product,
}: {
  product: {
    items?: CheckoutLineItem[];
    packageId: string;
    packageLabel: string;
    quantity?: number;
    guaranteedPicks?: GuaranteedPick[];
  };
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

  return (
    <ul className="flex flex-col gap-2">
      {lines.map((line, index) => {
        const picks = picksFor(line, index);
        return (
          <li key={`${line.packageId}-${index}`}>
            <span className="block font-medium text-foreground">
              {line.quantity} × {line.packageLabel}
            </span>
            {picks.length > 0 ? (
              <>
                <span className="mt-0.5 block text-caption text-muted-foreground">
                  Must include:
                </span>
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {picks.map((pick) => (
                    <li key={pick.snackItemId} className="text-caption text-foreground">
                      • {pick.name}
                      {pick.origin ? (
                        <span className="text-muted-foreground"> ({pick.origin})</span>
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
