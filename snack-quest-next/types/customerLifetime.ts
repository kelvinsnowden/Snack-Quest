import type { Timestamp } from 'firebase-admin/firestore';

/**
 * `customerLifetime/{businessId}__{phoneNumber}` — one document per
 * customer, holding the facts a lifetime metric needs
 * (§ analytics rollups).
 *
 * This exists because "when did this person first buy from us" cannot
 * be answered from a window. `getLtv` and `getCac` used to read the
 * newest thousand orders and infer a first order from them, which is
 * only correct while the business has fewer than a thousand orders —
 * and fails silently, with a flattering number, rather than loudly.
 *
 * Derived, never authored: `AnalyticsRollupService.rebuildCustomerLifetime`
 * recomputes these from `orders`, which stays the source of truth. A
 * rebuild is idempotent and removes customers whose orders no longer
 * qualify, so a refunded or cancelled order corrects the rollup rather
 * than leaving a ghost behind.
 *
 * Keyed by phone number because that is who the customer actually is
 * here: the common case is a guest WhatsApp shopper with no Firebase
 * Auth account, the same reason `CustomerService` aggregates on phone
 * rather than on `customerProfiles`.
 */
export interface CustomerLifetime {
  businessId: string;
  phoneNumber: string;
  customerName: string;
  /** The earliest realised-revenue order, over all time — the field the window could not see. */
  firstOrderAt: Timestamp;
  lastOrderAt: Timestamp;
  /** The channel of the *first* order, which is what acquisition is attributed to. */
  firstOrderChannel: string;
  orderCount: number;
  totalRevenueKes: number;
  /** When this document was last recomputed, so a stale rollup can be seen rather than assumed fresh. */
  rebuiltAt: Timestamp;
}
