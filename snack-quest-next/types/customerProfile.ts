import type { AuditFields } from './common';

/**
 * `customerProfiles/{uid}` — customer-specific business data. TDD §8.
 * Dead in practice: it's keyed by Firebase Auth uid, but the real,
 * common customer is a guest WhatsApp shopper with no Auth account at
 * all (`services/customerService.ts`'s own doc comment) — nothing in
 * this codebase ever writes to this collection.
 *
 * `walletBalanceKes` / `lifetimeCreditsEarnedKes` specifically are
 * superseded by `customerWallets` (§ Phase 4: Customer loyalty / Quest
 * system, `types/customerWallet.ts`), which is keyed by phone number
 * instead — the identity that actually exists for a real order. Left
 * in place here rather than deleted outright since the wider
 * `customerProfiles` question (build real Auth-based customer accounts
 * some day, or delete the collection) is unresolved and out of this
 * phase's scope.
 */
export interface CustomerProfile extends AuditFields {
  businessId: string;
  // Financial fields — rules §9 blocks direct client writes to these two.
  walletBalanceKes: number;
  lifetimeCreditsEarnedKes: number;
  referralCode: string;
  county: string;
  deliveryAddress: string;
  favouriteCategories: string[];
  dietaryPreferences: string[];
}
