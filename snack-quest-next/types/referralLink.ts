import type { AuditFields } from './common';

/**
 * `referralLinks/{linkId}` — a creator's referral code
 * (PLATFORM_ARCHITECTURE_V2.md §8). Deliberately minimal: just what a
 * real order today needs — a code to validate, a discount to apply to
 * the customer, a commission to credit the creator. Attribution
 * windows, click tracking, and fraud scoring are out of scope until a
 * real order needs them.
 */
export interface ReferralLink extends AuditFields {
  businessId: string;
  code: string;
  ownerId: string;
  discountKes: number;
  commissionKes: number;
  isActive: boolean;
}
