import type { AuditFields } from './common';

/**
 * `referralLinks/{linkId}` — a creator's referral code
 * (PLATFORM_ARCHITECTURE_V2.md §8). Deliberately minimal: just what a
 * real order needs — a code to validate, a discount to apply to the
 * customer, a commission to credit the creator — plus, since the
 * Creator Portal (§ Creator Portal referral links) is now the real
 * order that needs it, real click/conversion counters: `clickCount`
 * increments in `app/r/[code]/route.ts` on every real
 * click-through, `conversionCount` increments in the same transaction
 * as `ReferralService.awardCommission()`. Attribution windows and
 * fraud scoring remain out of scope until a real need arrives.
 */
export interface ReferralLink extends AuditFields {
  businessId: string;
  code: string;
  ownerId: string;
  discountKes: number;
  commissionKes: number;
  isActive: boolean;
  clickCount: number;
  conversionCount: number;
}
