import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

/** `campaignSubmissions/{submissionId}` — creator deliverable proof. TDD §8. Same `businessId` invariant as `Campaign` — see that type's comment. */
export interface CampaignSubmission extends AuditFields {
  businessId: string;
  campaignId: string;
  /** Denormalized from campaigns at write time — TDD §8 design principles. */
  campaignTitle: string;
  creatorId: string;
  submissionType: string;
  /** Up to 3 proof images the creator attaches (§ campaign attachments). Defaults to `[]`; absent on any submission created before this field existed. */
  imageUrls: string[];
  /** A single supporting document (PDF only, via the `documents` storage directory). `null` if the creator didn't attach one. */
  documentUrl: string | null;
  socialLink: string | null;
  notes: string;
  status: SubmissionStatus;
  adminFeedback: string | null;
  reviewedBy: string | null;
  reviewedAt: Timestamp | null;
}
