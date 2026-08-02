import type { Timestamp } from 'firebase/firestore';

/**
 * `marketingSpendEntries/{businessId}_{month}` — a manually-entered
 * total ad/marketing spend for one calendar month, the input CAC
 * (§ Admin: Analytics) is computed from. There is no ads-platform
 * integration in this codebase (no Meta Ads Manager/Google Ads API
 * credentials anywhere — the existing Meta integration is outbound
 * Conversion API events for ad optimization, not a spend-reporting
 * API), so real CAC has no automatic spend source; a business
 * genuinely has to tell this platform what it spent, the same way
 * most small businesses track CAC manually today.
 */
export interface MarketingSpendEntry {
  businessId: string;
  /** `YYYY-MM`. */
  month: string;
  amountKes: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy: string;
}
