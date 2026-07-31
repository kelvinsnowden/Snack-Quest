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
  // block direct client writes to these three via diff().affectedKeys()).
  availableCashKes: number;
  pendingEarningsKes: number;
  lifetimeEarningsKes: number;
  totalClicks: number;
  totalConversions: number;
  bio: string;
  niche: string;
  followersRange: string;
  paymentPreference: PaymentPreference;
  socialHandles: Record<string, string>;
  onboardingCompleted: boolean;
  status: CreatorStatus;
  schemaVersion: number;
}
