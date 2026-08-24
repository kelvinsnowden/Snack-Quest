import type { AuditFields } from './common';

/**
 * `snackItems/{itemId}` — the catalogue of individual snacks the
 * business buys, as opposed to the boxes it sells.
 *
 * The first thing in this codebase to model a snack at all. Everything
 * else treats a box as an atom: `packages` are boxes, and so are
 * `inventoryBatch.packageId` and `PurchaseOrderLineItem` despite the
 * latter's generic name. Nothing until now recorded what actually goes
 * inside one.
 *
 * Shared rather than embedded in each recipe, because the same snack
 * appears in several boxes. One row means one photo to upload and one
 * price to correct when the market moves — with per-recipe items, a
 * price change would have to be found and repeated in every box that
 * happens to contain it, and would eventually be missed in one.
 */
export interface SnackItem extends AuditFields {
  businessId: string;
  /** Specific enough to buy the right thing off a shelf: "Calbee Shrimp Chips 70g", not "shrimp chips". */
  name: string;
  /** Vercel Blob URL in the existing `snacks` directory. Null until a photo is uploaded — the recipe views show a placeholder rather than a broken image. */
  imageUrl: string | null;
  /**
   * What one unit is expected to cost at the market. Expected, not
   * actual: prices move, and what a runner really paid is recorded per
   * trip on `ShoppingRunLine.actualUnitCostKes` rather than overwriting
   * this. This is the planning number; that is the history.
   */
  expectedUnitCostKes: number;
  /** What "one" means for this snack — "bag", "pack", "bottle". Shown next to the quantity so "3" is never ambiguous on a phone at a market stall. */
  unitLabel: string;
  /** Japan, Korea, China, Thailand… Free text rather than an enum: the sourcing range is explicitly expected to widen (§ international positioning). Null when it does not matter. */
  origin: string | null;
  /** Where to actually buy it — "Chinese supermarket, Diamond Plaza". The single most useful field for a runner who did not do the last shop themselves. */
  sourcingNote: string | null;
  /** Kept out of new recipes and shopping runs without deleting history — a discontinued snack still has to render on the runs that already contain it. */
  isActive: boolean;
  /**
   * Whether a customer may choose this snack as one of their
   * guaranteed picks (§ Premium: choose 5, discover the rest).
   *
   * Off by default, and that default is deliberate: this catalogue
   * exists for buying and packing, so it holds things no customer
   * should be picking from — bulk staples, packaging fillers, a snack
   * being trialled. An admin opts a snack in.
   */
  availableForPremiumSelection?: boolean;
  /**
   * Units on hand, when the business actually counts this snack.
   * Undefined means untracked rather than zero — the same convention
   * `Package.stockCount` uses, and the honest one for a catalogue
   * where most rows have never been counted. A tracked snack at 0 is
   * hidden from the picker and refused server-side.
   */
  stockCount?: number;
}
