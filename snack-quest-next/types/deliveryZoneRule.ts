import type { Timestamp } from 'firebase/firestore';

/**
 * `deliveryZoneRules/{ruleId}` — the flat per-zone delivery pricing
 * table a `PickupStation.deliveryFeeKes` is populated from
 * (PLATFORM_ARCHITECTURE_V2.md §12). `ruleId` is the deterministic
 * key `${zone}:${shippingOrigin}:${packageCategory}:${courier}`
 * (see `repositories/deliveryZoneRuleRepository.ts`), so a fee lookup
 * is a single doc read, never a query.
 *
 * `feeKes: null` is the honest default — this codebase has no real
 * Jumia small-package rate card to draw from, and inventing per-zone
 * KES figures would be fabricating financial data a real customer
 * would actually be charged. Every zone this dataset produces is
 * seeded with `feeKes: null`; a real rate card needs to be entered
 * (see `scripts/seedPickupStations.mjs`'s own logging of this) before
 * a zone's fee is anything other than "not yet configured."
 */
export interface DeliveryZoneRule {
  businessId: string;
  zone: string;
  shippingOrigin: string;
  packageCategory: string;
  courier: string;
  feeKes: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
