import type { Timestamp } from 'firebase/firestore';

/**
 * `referralAttributions/{attributionId}` — the ledger proving why a
 * creator was credited a commission (PLATFORM_ARCHITECTURE_V2.md §8).
 * One per order that used a referral code.
 */
export interface ReferralAttribution {
  businessId: string;
  referralLinkId: string;
  creatorId: string;
  orderId: string;
  conversationId: string;
  discountKes: number;
  commissionKes: number;
  status: 'awarded';
  createdAt: Timestamp;
}
