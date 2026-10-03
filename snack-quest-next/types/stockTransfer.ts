import type { Timestamp } from 'firebase/firestore';

/**
 * Where stock is (§ INVENTORY TRANSFER LEDGER, docs/OS_MASTER_GAP_ANALYSIS.md
 * §3.4). `transit` is keyed by the restock task carrying it; `machine` by the
 * machine (and slot, when known); `owner` is stock an owner holds outside a
 * machine; `waste`, `damaged` and `lost` are terminal.
 */
export const STOCK_HOLDER_KINDS = ['warehouse', 'transit', 'machine', 'owner', 'waste', 'damaged', 'lost'] as const;
export type StockHolderKind = (typeof STOCK_HOLDER_KINDS)[number];

export interface StockHolder {
  kind: StockHolderKind;
  /** Warehouse id (null for the main warehouse), restock task id, machine id or partner id; null for terminal holders. */
  id: string | null;
  slotId?: string | null;
}

export const STOCK_TRANSFER_REASONS = [
  'restock_dispatch',
  'restock_receive',
  'restock_shortfall',
  'removed_expired',
  'removed_damaged',
  'returned_to_warehouse',
  'wholesale_to_owner',
] as const;
export type StockTransferReason = (typeof STOCK_TRANSFER_REASONS)[number];

export const STOCK_TRANSFER_REASON_LABEL: Record<StockTransferReason, string> = {
  restock_dispatch: 'Sent out for restocking',
  restock_receive: 'Loaded into the machine',
  restock_shortfall: 'Did not arrive',
  removed_expired: 'Removed — expired',
  removed_damaged: 'Removed — damaged',
  returned_to_warehouse: 'Returned to the warehouse',
  wholesale_to_owner: 'Sold to the owner (wholesale)',
};

/**
 * `stockTransfers/{id}` — one quantity of one product moving from one holder
 * to another. The ledger never edits a count: every change of where stock is,
 * or who owns it, is a new entry with its cost basis at that moment.
 */
export interface StockTransfer {
  businessId: string;
  productCatalogue: 'package' | 'snackItem' | null;
  productId: string | null;
  quantity: number;
  from: StockHolder;
  to: StockHolder;
  /** Who owns the stock after this move. */
  ownership: 'snack_quest' | 'machine_owner';
  ownerPartnerId: string | null;
  /** Cost of one unit to its owner after this move (landed for Snack Quest stock, the wholesale price for an owner's); null when unknown. */
  unitCostBasisKes: number | null;
  reason: StockTransferReason;
  restockTaskId: string | null;
  machineId: string | null;
  ownerWholesaleSaleId: string | null;
  note: string | null;
  actor: string;
  createdAt: Timestamp;
}

/**
 * `ownerWholesaleSales/{id}` — stock that passed from Snack Quest to a machine
 * owner, at the owner price in effect then (§ OWNER INVENTORY COST). Written
 * when a restock of an owner-stocked machine is received. It is the owner's
 * record of what they bought; how and when they pay for it is set by the
 * agreement (today, deducted from settlement as units sell — so this record
 * never charges them a second time).
 */
export interface OwnerWholesaleSale {
  businessId: string;
  partnerId: string;
  machineId: string;
  restockTaskId: string;
  lines: {
    productCatalogue: 'package' | 'snackItem' | null;
    productId: string | null;
    slotId: string;
    quantity: number;
    unitWholesaleKes: number | null;
    unitLandedKes: number | null;
  }[];
  totalWholesaleKes: number;
  totalLandedKes: number;
  /** Units whose wholesale price wasn't recorded — counted, never priced at zero. */
  unpricedUnits: number;
  actor: string;
  createdAt: Timestamp;
}
