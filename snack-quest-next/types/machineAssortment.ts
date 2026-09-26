import type { Timestamp } from 'firebase/firestore';

/**
 * `machineAssortments/{machineId}__{productCatalogue}__{productId}` —
 * Snack Quest's own decision that a machine should carry a product,
 * kept distinct from where it's physically placed and how many units
 * exist (§ MACHINE ASSORTMENT, docs/MACHINE_ASSORTMENT.md).
 *
 * `productId`/`productCatalogue` reference the *existing* global
 * catalogue (`packages`/`snackItems`) — same discriminator
 * `MachineSlot.productCatalogue` already uses, deliberately not a
 * third product table. This collection answers "what does Snack Quest
 * want this machine to sell", independently of `MachineSlot`
 * ("where, physically") and `MachineInventoryMovement`
 * ("how many units exist") — a product can be assorted before a slot
 * is ever assigned to it (`slotCode: null`), and a slot can go empty
 * without ever being un-assorted.
 *
 * Never trusted for pricing/availability decisions on its own — see
 * `machineAssortmentService.getSellableCatalog`, which is the one
 * place `assorted`/`visible` combine with the *live* slot/inventory/
 * machine-status facts to decide what a customer can actually buy.
 * This document alone only ever answers "is this part of the plan".
 */
export type MachineAssortmentPromotionalState = 'none' | 'featured' | 'new' | 'limited_time';

/**
 * The five states a customer screen must be able to tell apart
 * (§ PRODUCT STATES) — never a bare boolean. Only `available` allows a
 * purchase; every other state exists so the screen shows the customer
 * an honest reason rather than just omitting the product or, worse,
 * accepting a payment it can't fulfil. `hidden` never reaches
 * `getSellableCatalog`'s response at all (an assortment row with
 * `visible: false` is filtered out before this state is computed) —
 * it's listed here only because it's part of the same named
 * vocabulary and because a preview/ops view over the raw assortment
 * rows (not the sellable catalog) does need to render it.
 */
export type ProductAvailabilityState = 'available' | 'sold_out' | 'unavailable' | 'coming_soon' | 'hidden';

export interface MachineAssortment {
  businessId: string;
  machineId: string;
  productId: string;
  productCatalogue: 'package' | 'snackItem';
  /** Snack Quest's own configured intent — independent of whether a slot exists yet or currently has stock. */
  assorted: boolean;
  /** Set once a physical slot is assigned to this product on this machine; null while assorted but not yet placed. References `MachineSlot.slotCode`, never a second position field. */
  slotCode: string | null;
  /** Merchandising/display order on the customer screen — never used for anything financial. */
  displayOrder: number;
  category: string | null;
  /** Overrides the global product's own name for this machine's screen only — null falls back to the global catalogue at read time. */
  customerFacingName: string | null;
  customerFacingDescription: string | null;
  customerFacingImageUrl: string | null;
  /** Overrides the global/slot price for this machine's screen — see `machineAssortmentPriceHistory` for the audit trail a change to this field writes. Null falls back to `MachineSlot.priceKes`. */
  priceOverrideKes: number | null;
  promotionalState: MachineAssortmentPromotionalState;
  /** Both null = always in effect once assorted. Used for a limited-time promotional window, not for the assortment decision itself — an expired-but-still-assorted product is still assorted, just no longer promotional. */
  effectiveFrom: Timestamp | null;
  effectiveTo: Timestamp | null;
  /** Separate from `assorted`: a staff member can hide an assorted, in-stock product from the customer screen (e.g. mid-swap) without un-assorting it. */
  visible: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export function machineAssortmentDocId(
  machineId: string,
  productCatalogue: MachineAssortment['productCatalogue'],
  productId: string,
): string {
  return `${machineId}__${productCatalogue}__${productId}`;
}

/**
 * `machineAssortmentPriceHistory/{entryId}` — the audit trail a
 * `priceOverrideKes` change writes (§ MACHINE-SPECIFIC PRICING: "track
 * price overrides and changes with an audit trail"). Append-only;
 * `machineAssortmentService.setPriceOverride` is the only writer.
 */
export interface MachineAssortmentPriceHistoryEntry {
  businessId: string;
  machineId: string;
  productId: string;
  productCatalogue: 'package' | 'snackItem';
  /** Null means "no override — fell back to the slot/global price" at that point in time. */
  previousPriceOverrideKes: number | null;
  newPriceOverrideKes: number | null;
  actor: string;
  createdAt: Timestamp;
}

/**
 * What a customer screen actually receives from
 * `GET /api/vending/machines/{machineId}/catalog`
 * (§ CUSTOMER SCREEN MUST BE THIN, § MACHINE CUSTOMER CATALOG). Every
 * field here is a business-layer decision already made — the screen
 * renders this, it does not compute any of it.
 */
export interface SellableCatalogItem {
  productId: string;
  productCatalogue: 'package' | 'snackItem';
  slotCode: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  priceKes: number;
  /**
   * The one true availability signal a screen needs to decide what to
   * render. Derived, never stored — see
   * `machineAssortmentService.getSellableCatalog`'s own doc comment for
   * exactly which facts combine to produce it.
   */
  availabilityState: ProductAvailabilityState;
  /** `availabilityState === 'available'` — kept alongside it only because it's the one field server-side purchase validation actually needs to check; the screen itself should render off `availabilityState`, not this. */
  sellable: boolean;
  displayOrder: number;
  promotionalState: MachineAssortmentPromotionalState;
}
