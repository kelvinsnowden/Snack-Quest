import type { Timestamp } from 'firebase/firestore';

/**
 * Who owns a machine (§ OWNERSHIP, docs/OS_MASTER_GAP_ANALYSIS.md §3.1).
 * Stored on the machine; a machine written before this field existed is
 * read by `ownershipTypeOf` — Snack Quest's when it has no owner, a third
 * party's when it has one — which is what those records always meant.
 */
export const MACHINE_OWNERSHIP_TYPES = ['snack_quest', 'third_party', 'partner_franchise'] as const;
export type MachineOwnershipType = (typeof MACHINE_OWNERSHIP_TYPES)[number];

export const MACHINE_OWNERSHIP_LABEL: Record<MachineOwnershipType, string> = {
  snack_quest: 'Snack Quest',
  third_party: 'Third-party owner',
  partner_franchise: 'Partner / franchise',
};

/** Who owns the stock inside a machine. */
export const INVENTORY_OWNERS = ['snack_quest', 'machine_owner'] as const;
export type InventoryOwner = (typeof INVENTORY_OWNERS)[number];

/**
 * What an owner pays for the stock they sell. `landed_cost` is what
 * settlement has always deducted (Snack Quest's own cost); `wholesale_price`
 * is the owner price from the price book, so Snack Quest earns the
 * difference as its wholesale margin.
 */
export const OWNER_COST_BASES = ['landed_cost', 'wholesale_price'] as const;
export type OwnerCostBasis = (typeof OWNER_COST_BASES)[number];

/** How an owner machine's sales are divided. */
export const SETTLEMENT_MODELS = ['owner_keeps_margin', 'revenue_share'] as const;
export type SettlementModel = (typeof SETTLEMENT_MODELS)[number];

export const MAINTENANCE_RESPONSIBILITIES = ['snack_quest', 'owner'] as const;
export type MaintenanceResponsibility = (typeof MAINTENANCE_RESPONSIBILITIES)[number];

/**
 * The commercial terms on an owner agreement that decide the money.
 * Every field is optional on stored agreements: a missing term resolves to
 * the behaviour the system had before the term existed
 * (`DEFAULT_COMMERCIAL_TERMS`), never to an invented number.
 */
export interface CommercialTerms {
  inventoryOwner: InventoryOwner;
  ownerCostBasis: OwnerCostBasis;
  settlementModel: SettlementModel;
  /** Share of advertising revenue on this machine paid to the owner, 0–100. */
  adRevenueSharePartnerPct: number;
  maintenanceResponsibility: MaintenanceResponsibility;
  /** Whether the owner may see Snack Quest's landed cost. Off unless agreed. */
  showLandedCostToOwner: boolean;
}

export const DEFAULT_COMMERCIAL_TERMS: CommercialTerms = {
  inventoryOwner: 'snack_quest',
  ownerCostBasis: 'landed_cost',
  settlementModel: 'owner_keeps_margin',
  adRevenueSharePartnerPct: 0,
  maintenanceResponsibility: 'snack_quest',
  showLandedCostToOwner: false,
};

/**
 * Everything the money depends on for one machine at one moment, resolved
 * once (`machineEconomicProfileService`) and read by settlement, the
 * machine P&L, the owner portal and the sale snapshot — never assembled
 * again from raw fields elsewhere.
 */
export interface MachineEconomicProfile {
  machineId: string;
  ownershipType: MachineOwnershipType;
  /** Null for a Snack Quest machine. */
  partnerId: string | null;
  agreementId: string | null;
  terms: CommercialTerms;
  /** Owner machines are settled with their owner; Snack Quest machines are not. */
  settlesWithOwner: boolean;
  locationId: string | null;
  /** From the location's expenses, when recorded. Null when not recorded — never assumed. */
  locationCommissionPct: number | null;
  /** True when the machine has an owner but no active agreement: terms are the defaults, and the profile says so. */
  termsAreDefault: boolean;
}

/** The kinds of price a product has (§ PRICE BOOK). The machine retail price lives on the slot and is snapshotted on every sale. */
export const PRODUCT_PRICE_TYPES = ['landed_cost', 'owner_wholesale', 'retail_list'] as const;
export type ProductPriceType = (typeof PRODUCT_PRICE_TYPES)[number];

export const PRODUCT_PRICE_TYPE_LABEL: Record<ProductPriceType, string> = {
  landed_cost: 'Snack Quest landed cost',
  owner_wholesale: 'Owner wholesale price',
  retail_list: 'Suggested retail price',
};

/**
 * `productPrices/{id}` — one price of one product for a span of time.
 * Setting a new price closes the open entry (`effectiveTo`) in the same
 * transaction, so at any moment at most one entry per product and type is
 * in effect, and the history is never rewritten.
 */
export interface ProductPrice {
  businessId: string;
  productCatalogue: 'package' | 'snackItem';
  productId: string;
  priceType: ProductPriceType;
  amountKes: number;
  effectiveFrom: Timestamp;
  /** Null while this is the current price. */
  effectiveTo: Timestamp | null;
  reason: string;
  createdBy: string;
  createdAt: Timestamp;
}

/**
 * The economics of one sale, frozen when the sale was created. A later
 * change to a cost, a wholesale price, the machine's owner or the
 * agreement never changes what an old sale cost or earned.
 */
export interface SaleEconomicsSnapshot {
  retailPriceKes: number;
  /** Snack Quest's landed cost per unit at the time; null when none was recorded. */
  landedCostKes: number | null;
  /** The owner wholesale price per unit at the time; null when none was recorded. */
  ownerWholesaleKes: number | null;
  ownershipType: MachineOwnershipType;
  inventoryOwner: InventoryOwner;
  ownerCostBasis: OwnerCostBasis;
  partnerId: string | null;
  agreementId: string | null;
  resolvedAt: Timestamp;
}
