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
  /** A creative asset (banner image or short video) for this campaign, uploaded via the same Vercel Blob storage every other admin image upload uses. `null` until an admin uploads one — a campaign can be drafted before its artwork is ready. Shown as the cover on every card/carousel; distinct from `imageUrls` below. */
  assetsUrl: string | null;
  /** Up to 5 additional images an admin can attach (§ campaign attachments) — shown as a gallery on the campaign detail page, alongside (not instead of) the single `assetsUrl` cover. Defaults to `[]`; absent on any campaign created before this field existed. */
  imageUrls: string[];
  /** A single downloadable reference document (PDF only, via the `documents` storage directory) — a brief, guidelines, or brand assets. `null` until an admin attaches one. */
  documentUrl: string | null;
  /** An external reference URL (e.g. an example post) shown on the campaign detail page. `null` until an admin sets one. */
  referenceLink: string | null;
  deadline: Timestamp;
  targetNiche: string;
  schemaVersion: number;
}
