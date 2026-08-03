import type { AuditFields } from './common';

export type CreatorTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type CreatorStatus = 'pending' | 'active' | 'suspended';
export type PaymentPreference = 'mpesa' | 'bank';

/** `creatorProfiles/{uid}` — creator-specific business data. TDD §8. */
export interface CreatorProfile extends AuditFields {
  businessId: string;
  referralCode: string;
  tier: CreatorTier;
  // Financial fields — client-writable only by the server (rules §9
  // block direct client writes to these via diff().affectedKeys()).
  availableCashKes: number;
  pendingEarningsKes: number;
  lifetimeEarningsKes: number;
  /**
   * The commission this creator earns per successful referral, in
   * KES (§ referral system overhaul) — locked in at registration from
   * their real registration order and never recalculated afterward,
   * so an early creator keeps their rate even after the platform has
   * long since moved past the first-50 threshold. See
   * `lib/creators/referralEconomics.ts` for the tier constants this
   * is resolved from.
   */
  commissionRateKes: number;
  totalClicks: number;
  totalConversions: number;
  bio: string;
  niche: string;
  followersRange: string;
  paymentPreference: PaymentPreference;
  /** § Creator Portal payout details — a saved default M-Pesa number for withdrawal requests, so a creator doesn't retype it every time. Optional: a withdrawal request can still supply its own number when this is unset. */
  payoutPhoneNumber: string | null;
  socialHandles: Record<string, string>;
  onboardingCompleted: boolean;
  status: CreatorStatus;
  schemaVersion: number;
}
