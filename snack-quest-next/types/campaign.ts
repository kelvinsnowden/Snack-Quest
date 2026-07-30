import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'ended';

/** `campaigns/{campaignId}` — brand campaigns creators can join. TDD §8. */
export interface Campaign extends AuditFields {
  title: string;
  status: CampaignStatus;
  commissionRateKes: number;
  rules: string;
  assetsUrl: string;
  deadline: Timestamp;
  targetNiche: string;
  schemaVersion: number;
}
