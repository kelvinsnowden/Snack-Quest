import type { ShoppingRun, ShoppingRunLine, ShoppingRunStatus, SnackItem } from '@/types';

/**
 * Client-safe shapes for the recipe and shopping surfaces. Firestore
 * `Timestamp` fields are class instances that the RSC boundary refuses
 * to pass into a Client Component — same conversion
 * `lib/marketingEmails/serialize.ts` already does for campaigns.
 */

export type SerializedShoppingRunLine = ShoppingRunLine;

export interface SerializedShoppingRun {
  id: string;
  status: ShoppingRunStatus;
  orderIds: string[];
  orderCount: number;
  lines: SerializedShoppingRunLine[];
  expectedTotalKes: number;
  actualTotalKes: number;
  missingRecipePackageIds: string[];
  notes: string;
  createdAt: string;
  completedAt: string | null;
  completedBy: string | null;
}

export function serializeShoppingRun(id: string, data: ShoppingRun): SerializedShoppingRun {
  return {
    id,
    status: data.status,
    orderIds: data.orderIds,
    orderCount: data.orderCount,
    lines: data.lines,
    expectedTotalKes: data.expectedTotalKes,
    actualTotalKes: data.actualTotalKes,
    missingRecipePackageIds: data.missingRecipePackageIds,
    notes: data.notes,
    createdAt: data.createdAt.toDate().toISOString(),
    completedAt: data.completedAt ? data.completedAt.toDate().toISOString() : null,
    completedBy: data.completedBy,
  };
}

export interface SerializedSnackItem {
  id: string;
  name: string;
  imageUrl: string | null;
  expectedUnitCostKes: number;
  unitLabel: string;
  origin: string | null;
  sourcingNote: string | null;
  isActive: boolean;
  /** Undefined on every snack predating the field — the catalogue treats that as "not opted in". */
  availableForPremiumSelection?: boolean;
  /** Undefined means untracked, never zero (see `SnackItem.stockCount`). */
  stockCount?: number;
}

export function serializeSnackItem(id: string, data: SnackItem): SerializedSnackItem {
  return {
    id,
    name: data.name,
    imageUrl: data.imageUrl,
    expectedUnitCostKes: data.expectedUnitCostKes,
    unitLabel: data.unitLabel,
    origin: data.origin,
    sourcingNote: data.sourcingNote,
    isActive: data.isActive,
    availableForPremiumSelection: data.availableForPremiumSelection ?? false,
    // Preserved as absent rather than coerced to 0 — the two mean
    // different things and the form has to tell them apart.
    ...(data.stockCount === undefined ? {} : { stockCount: data.stockCount }),
  };
}
