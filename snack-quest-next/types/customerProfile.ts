import type { AuditFields } from './common';

/** `customerProfiles/{uid}` — customer-specific business data. TDD §8. */
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
