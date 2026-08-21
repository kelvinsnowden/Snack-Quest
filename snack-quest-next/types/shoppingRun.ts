import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

export type ShoppingRunStatus = 'open' | 'completed';

/**
 * One snack on a shopping run: how many are needed across every order
 * in the run, and what was actually bought.
 *
 * The `Snapshot` fields are copied from the catalogue when the run is
 * created and never re-read. A run is a physical trip someone is out
 * on; if a colleague renames a snack or corrects its price while the
 * runner is at the market, the list in their hand must not change under
 * them. It also means a completed run keeps showing what the shop
 * actually looked like at the time rather than today's catalogue.
 */
export interface ShoppingRunLine {
  snackItemId: string;
  nameSnapshot: string;
  imageUrlSnapshot: string | null;
  unitLabelSnapshot: string;
  sourcingNoteSnapshot: string | null;
  /** Per-unit cost expected when the run was created. */
  expectedUnitCostKes: number;
  /** Total units needed across every order in this run. */
  quantityNeeded: number;
  /** What the runner actually paid per unit. Null until they record it — never silently defaulted to the expected price, since "not yet recorded" and "cost exactly what we thought" are different facts. */
  actualUnitCostKes: number | null;
  /** How many were actually bought — may be short of `quantityNeeded` when a shop runs out. Null until recorded. */
  actualQuantity: number | null;
  /** Ticked off by the runner. Separate from `actualUnitCostKes` so a line can be marked bought at the shelf and priced at the till. */
  purchased: boolean;
  /** "Only 4 left", "substituted strawberry". */
  note: string | null;
}

/**
 * `shoppingRuns/{runId}` — one trip to buy the snacks for a group of
 * orders, built by aggregating those orders' box recipes.
 *
 * Its own collection rather than an extension of `fulfillmentBatches`,
 * whose type comment is explicit that a batch is created already
 * complete and never edited — the record of a trip's cost, not a
 * working document. A run is the opposite: it exists precisely to be
 * edited, line by line, by someone standing in a shop. Keeping them
 * separate leaves that discipline intact, and a completed run's
 * `actualTotalKes` is exactly the real number a `fulfillmentBatch`'s
 * `costs.productsPurchasedKes` wants, rather than the lump sum someone
 * currently types in from memory.
 */
export interface ShoppingRun extends AuditFields {
  businessId: string;
  /** The orders this trip covers. Fixed at creation — adding an order means a new run, so the list someone is shopping against cannot grow while they are out. */
  orderIds: string[];
  orderCount: number;
  status: ShoppingRunStatus;
  lines: ShoppingRunLine[];
  /** `sum(expectedUnitCostKes × quantityNeeded)` at creation — the budget. */
  expectedTotalKes: number;
  /** `sum(actualUnitCostKes × actualQuantity)` over recorded lines. Recomputed on every line update, so it is always the real spend so far rather than a figure someone has to remember to refresh. */
  actualTotalKes: number;
  /**
   * Boxes in these orders that have no recipe yet. Recorded rather than
   * skipped in silence: a run that quietly under-buys because one box
   * was never given a recipe is worse than one that says so on its face.
   */
  missingRecipePackageIds: string[];
  completedAt: Timestamp | null;
  completedBy: string | null;
  notes: string;
}
