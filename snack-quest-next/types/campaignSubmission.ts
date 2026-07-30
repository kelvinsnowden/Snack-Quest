import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

/** `campaignSubmissions/{submissionId}` — creator deliverable proof. TDD §8. */
export interface CampaignSubmission extends AuditFields {
  campaignId: string;
  /** Denormalized from campaigns at write time — TDD §8 design principles. */
  campaignTitle: string;
  creatorId: string;
  submissionType: string;
  fileUrl: string | null;
  socialLink: string | null;
  notes: string;
  status: SubmissionStatus;
  adminFeedback: string | null;
  reviewedBy: string | null;
  reviewedAt: Timestamp | null;
}
