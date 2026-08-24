import type { GuaranteedPick, Package, SnackItem } from '@/types';

/**
 * The rules for a box that lets a customer choose part of its contents
 * (§ Premium: choose 5, discover the rest).
 *
 * Pure, and shared by the checkout UI and the server that validates
 * it, so the picker cannot offer a snack the server will refuse. The
 * server still runs every check itself — the UI agreeing is a
 * convenience, never the reason a request is trusted.
 */

/** A box only offers picks when an admin has said how many. */
export function guaranteedPickCountFor(box: Pick<Package, 'guaranteedPickCount'>): number {
  const count = box.guaranteedPickCount;
  return typeof count === 'number' && count > 0 ? Math.trunc(count) : 0;
}

export function offersGuaranteedPicks(box: Pick<Package, 'guaranteedPickCount'>): boolean {
  return guaranteedPickCountFor(box) > 0;
}

/**
 * Whether a snack may be offered as a pick.
 *
 * Three separate conditions, because they fail for different reasons
 * and all three matter: the snack is retired, an admin has not opted
 * it in, or it is counted and there are none left. `stockCount`
 * undefined means untracked rather than zero — most of this catalogue
 * has never been counted, and treating that as "out of stock" would
 * empty the picker.
 */
export function isSelectableSnack(snack: Pick<SnackItem, 'isActive' | 'availableForPremiumSelection' | 'stockCount'>): boolean {
  if (!snack.isActive) {
    return false;
  }
  if (!snack.availableForPremiumSelection) {
    return false;
  }
  return snack.stockCount === undefined || snack.stockCount > 0;
}

export type PickValidationFailure =
  | { ok: false; reason: string };

export type PickValidationResult =
  | { ok: true; picks: GuaranteedPick[] }
  | PickValidationFailure;

/**
 * Turns the snack ids a client sent into the picks that go on the
 * order, or explains why it will not.
 *
 * Everything here is checked against the real catalogue rather than
 * taken on the client's word, because this is the one place a
 * tampered request could otherwise put an unavailable — or simply
 * wrong — snack onto a packing list. The count, the existence of every
 * id, the tenant, eligibility and stock are all re-verified.
 *
 * Duplicates are rejected rather than de-duplicated: five ids where
 * two are the same is not five picks, and silently collapsing it would
 * hand the customer a box with four chosen snacks and no explanation.
 */
export function validateGuaranteedPicks(
  businessId: string,
  box: Pick<Package, 'guaranteedPickCount'>,
  snackItemIds: string[] | undefined,
  catalogue: Map<string, SnackItem>,
): PickValidationResult {
  const required = guaranteedPickCountFor(box);

  if (required === 0) {
    // A fully-curated box. Picks sent for it are ignored rather than
    // rejected — the whole box is a surprise either way, and failing
    // the checkout over an ignorable field would lose a real sale.
    return { ok: true, picks: [] };
  }

  const ids = snackItemIds ?? [];
  if (ids.length !== required) {
    return { ok: false, reason: `Choose exactly ${required} snacks for this box.` };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, reason: 'Each of your picks has to be a different snack.' };
  }

  const picks: GuaranteedPick[] = [];
  for (const id of ids) {
    const snack = catalogue.get(id);
    if (!snack || snack.businessId !== businessId) {
      return { ok: false, reason: 'One of your picks is no longer available — please choose again.' };
    }
    if (!isSelectableSnack(snack)) {
      return { ok: false, reason: `${snack.name} has just gone out of stock — please choose another.` };
    }
    picks.push({
      snackItemId: id,
      name: snack.name,
      origin: snack.origin,
      imageUrl: snack.imageUrl,
    });
  }

  return { ok: true, picks };
}
