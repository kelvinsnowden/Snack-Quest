import type { Timestamp } from 'firebase/firestore';

/**
 * What a machine cost Snack Quest and what it sold for (§ MACHINE DEALS).
 *
 * Separate from vending: these are the machine itself — bought, shipped,
 * cleared, installed, and for an owner's machine sold on — not the snacks
 * it sells.
 */

/** Landed: everything until the machine is in Kenya and ours. Installation: getting it working where it stands. */
export const MACHINE_COST_GROUPS = ['landed', 'installation'] as const;
export type MachineCostGroup = (typeof MACHINE_COST_GROUPS)[number];

export const MACHINE_COST_CATEGORIES = ['purchase', 'freight', 'duty_clearing', 'local_transport', 'installation', 'branding', 'setup_other'] as const;
export type MachineCostCategory = (typeof MACHINE_COST_CATEGORIES)[number];

export const MACHINE_COST_CATEGORY_GROUP: Record<MachineCostCategory, MachineCostGroup> = {
  purchase: 'landed',
  freight: 'landed',
  duty_clearing: 'landed',
  local_transport: 'landed',
  installation: 'installation',
  branding: 'installation',
  setup_other: 'installation',
};

export const MACHINE_COST_CATEGORY_LABEL: Record<MachineCostCategory, string> = {
  purchase: 'Purchase price (from the manufacturer)',
  freight: 'Shipping and freight',
  duty_clearing: 'Import duty, clearing and forwarding',
  local_transport: 'Transport from port to site',
  installation: 'Installation work',
  branding: 'Branding and wrap',
  setup_other: 'Other setup',
};

/** A machine costs no more than this in a single line — a typo guard, not a business rule. */
export const MAX_MACHINE_COST_KES = 50_000_000;

export interface MachineCostLine {
  businessId: string;
  machineId: string;
  category: MachineCostCategory;
  description: string;
  amountKes: number;
  /** Nairobi date, YYYY-MM-DD. */
  occurredOn: string;
  recordedBy: string;
  createdAt: Timestamp;
  voided: { at: Timestamp; by: string; reason: string } | null;
}

export interface MachineSaleRecord {
  /** The owner who bought it, when they are in the system. */
  buyerPartnerId: string | null;
  /** Nairobi date the sale was agreed, YYYY-MM-DD. */
  soldOn: string;
  /** The price of the machine itself. */
  machinePriceKes: number;
  /** Installation charged to the buyer on top of the machine price; 0 when it was included. */
  installationChargeKes: number;
  note: string | null;
  recordedBy: string;
  recordedAt: Timestamp;
}

/** One per machine (doc id = machineId): the live sale, and every sale that was cancelled. */
export interface MachineDeal {
  businessId: string;
  machineId: string;
  sale: MachineSaleRecord | null;
  cancelledSales: (MachineSaleRecord & { cancelledAt: Timestamp; cancelledBy: string; reason: string })[];
  /** Marked by staff: this machine had no installation cost, so none missing. Absent means not stated. */
  noInstallationCost: boolean;
  updatedAt: Timestamp;
}
