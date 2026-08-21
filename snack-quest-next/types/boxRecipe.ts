import type { AuditFields } from './common';

/** One line of a recipe: which snack, and how many go in the box. */
export interface BoxRecipeItem {
  snackItemId: string;
  quantity: number;
}

/**
 * `boxRecipes/{businessId}:{packageId}` — what goes inside one box.
 *
 * Keyed by the package it describes, so a box has exactly one current
 * recipe and looking it up is a document read rather than a query. That
 * also makes "does this box have a recipe yet" answerable without an
 * index.
 *
 * Deliberately stores only `snackItemId` and `quantity`, not a copy of
 * each snack's name, photo or price. The catalogue is the single source
 * of those, and duplicating them here is what would make a corrected
 * price show up in one place and not another. Where a snapshot IS
 * wanted — a shopping run, which must stay stable while someone is out
 * buying against it — the copy is taken there, at the moment the run is
 * created, and is explicitly named as a snapshot.
 *
 * Not versioned. `Order.packingRecipeVersionId` anticipates a versioned
 * model where an order pins the recipe as it stood when assigned; that
 * field has never been written by anything and is still `null` on every
 * order. Building version pinning before a single recipe exists would
 * be designing for a history that has not started yet, so this is the
 * current recipe only — and `packingRecipeVersionId` is left alone
 * rather than half-wired to something that does not mean what it says.
 */
export interface BoxRecipe extends AuditFields {
  businessId: string;
  packageId: string;
  items: BoxRecipeItem[];
  /** Anything the list cannot express — "wrap the ramune in bubble wrap", "swap the KitKat flavour if the matcha is out". */
  notes: string;
}
