import type { MarketingEmailCampaign, MarketingEmailSegment, MarketingEmailStatus } from '@/types';

/**
 * The client-safe shape of a campaign list row (§ Admin: Marketing
 * Emails) — `MarketingEmailCampaign`'s Firestore `Timestamp` fields
 * are class instances, which the RSC boundary refuses to pass from a
 * Server Component into a Client Component ("Classes or null
 * prototypes are not supported"). Same fix `StaffListItem`
 * (`services/staffManagementService.ts`) already applies to its own
 * `createdAt`/`lastSignInAt`: convert to a plain ISO string before it
 * ever crosses that boundary, whether that's an RSC prop or a JSON
 * API response.
 */
export interface SerializedMarketingEmailCampaign {
  id: string;
  subject: string;
  segment: MarketingEmailSegment;
  status: MarketingEmailStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  sentAt: string | null;
}

export function serializeCampaign(id: string, data: MarketingEmailCampaign): SerializedMarketingEmailCampaign {
  return {
    id,
    subject: data.subject,
    segment: data.segment,
    status: data.status,
    recipientCount: data.recipientCount,
    sentCount: data.sentCount,
    failedCount: data.failedCount,
    createdAt: data.createdAt.toDate().toISOString(),
    sentAt: data.sentAt ? data.sentAt.toDate().toISOString() : null,
  };
}
