import type { AuditFields } from './common';

export type QuestSubmissionStatus = 'pending' | 'approved' | 'rejected';

/**
 * `questSubmissions/{submissionId}` — customer quest proof. Parallel
 * structure to CampaignSubmission — same review workflow, different
 * audience. TDD §8.
 */
export interface QuestSubmission extends AuditFields {
  customerId: string;
  questId: string;
  proofUrl: string;
  status: QuestSubmissionStatus;
}
