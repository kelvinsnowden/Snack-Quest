import type { GuaranteedPick } from '@/types';

/**
 * One box on an order (§ more than one box per order).
 *
 * An order used to be a single `packageId` and a `quantity`, which is
 * every order this shop had taken until a customer asked for one of
 * each. Rather than replace those two fields — they are read in
 * thirteen files, including the warehouse's packing surfaces, where
 * being wrong means the wrong physical box goes out — orders now carry
 * a list *alongside* them, and the old pair holds the first line.
 *
 * So a one-box order is byte-identical to what it has always been, and
 * a two-box order is readable by anything that has been taught to look
 * at `items`. `orderLines()` is how everything reads them, so no
 * caller has to remember which shape it is holding.
 *
 * `unitPriceKes` and `packageLabel` are frozen copies, like every other
 * figure on a snapshot: an order records what was sold and at what
 * price, not what the catalogue says today.
 */
export interface CheckoutLineItem {
  packageId: string;
  packageLabel: string;
  quantity: number;
  unitPriceKes: number;
  /**
   * The snacks chosen for *this* box (§ Premium: choose 5, discover
   * the rest), on the line rather than on the order.
   *
   * An order used to be allowed only one pick-offering box, because
   * a single list of picks at the top of the order could not say which
   * box it belonged to — so a customer buying a Premium and a Deluxe
   * was told to place two separate orders. Putting the picks on the
   * line answers that by construction.
   *
   * Absent on a fully-curated box, which is what "the whole box is a
   * surprise" looks like in the data. Where `quantity` is more than
   * one, every box on the line is packed to the same picks; the
   * customer chose once for that row.
   */
  guaranteedPicks?: GuaranteedPick[];
  /**
   * The rest of what actually went in this box, chosen by the shop
   * (§ staff complete the box).
   *
   * A Premium box holds far more than the five a customer may choose.
   * Those five are a promise; this is the curation that fills the rest,
   * and it is only knowable after the order arrives and somebody packs
   * it — so it is written later rather than frozen at checkout.
   *
   * Deliberately a separate field from `guaranteedPicks` rather than
   * appended to it. Blending them would destroy the one distinction
   * that matters: what was promised to the customer, versus what the
   * shop chose. A packing list that cannot tell them apart cannot be
   * checked against the promise, and "guaranteed" would quietly come
   * to mean "whatever we happened to put in".
   */
  curatedSnacks?: GuaranteedPick[];
}

/**
 * The lines of an order or snapshot, whichever shape it was written
 * in.
 *
 * Orders written before line items existed have no `items`, and there
 * are real, paid ones in production — so this reconstructs the single
 * line they represent rather than returning nothing and quietly
 * dropping a box from a packing list.
 */
export function orderLines(source: {
  items?: CheckoutLineItem[];
  packageId: string;
  packageLabel: string;
  quantity?: number;
  unitPriceKes?: number;
}): CheckoutLineItem[] {
  if (source.items?.length) {
    return source.items;
  }
  return [
    {
      packageId: source.packageId,
      packageLabel: source.packageLabel,
      quantity: source.quantity ?? 1,
      unitPriceKes: source.unitPriceKes ?? 0,
    },
  ];
}

/** Total boxes, across every line — what the warehouse counts and what a courier is handed. */
export function totalBoxCount(lines: CheckoutLineItem[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * What to call an order's contents in a list, a table row or a
 * heading.
 *
 * One box reads as it always did — "Starter Box", with no count, since
 * "1 × Starter Box" is noise on the overwhelmingly common order. More
 * than one is spelled out in full, because the surfaces that show this
 * are the ones where somebody is about to pack, buy or chase the
 * physical thing, and a row that names only the first box is how the
 * second one fails to go out.
 */
export function orderBoxSummary(source: {
  items?: CheckoutLineItem[];
  packageId: string;
  packageLabel: string;
  quantity?: number;
}): string {
  const lines = orderLines(source);
  if (lines.length === 1) {
    return lines[0].packageLabel;
  }
  return lines.map((line) => `${line.quantity} × ${line.packageLabel}`).join(' + ');
}
