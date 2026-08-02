import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'ended';

/**
 * `campaigns/{campaignId}` — brand campaigns creators can join. TDD
 * §8. Carries `businessId` per the multi-tenancy invariant
 * (firestore.rules' own note: "every document that should belong to
 * exactly one business now carries a `businessId` field") — missing
 * here until § Creator Portal campaigns browse needed a real,
 * tenant-scoped query.
 */
export interface Campaign extends AuditFields {
  businessId: string;
  title: string;
  status: CampaignStatus;
  commissionRateKes: number;
  rules: string;
  assetsUrl: string;
  deadline: Timestamp;
  targetNiche: string;
  schemaVersion: number;
}
