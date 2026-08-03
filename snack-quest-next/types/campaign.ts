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
  /** A creative asset (banner image) for this campaign, uploaded via the same Vercel Blob storage every other admin image upload uses. `null` until an admin uploads one — a campaign can be drafted before its artwork is ready. */
  assetsUrl: string | null;
  deadline: Timestamp;
  targetNiche: string;
  schemaVersion: number;
}
