import type {
  MarketingSmsCampaign,
  MarketingSmsFailedRecipient,
  MarketingSmsSegment,
  MarketingSmsStatus,
  SmsOptOut,
} from '@/types';

/**
 * Client-safe shapes for the Admin SMS surfaces. Firestore `Timestamp`
 * fields are class instances, which the RSC boundary refuses to pass
 * from a Server Component into a Client Component — same conversion
 * `lib/marketingEmails/serialize.ts` already does for its own campaign
 * rows, applied here to campaigns and to the opt-out register.
 */

export interface SerializedMarketingSmsCampaign {
  id: string;
  name: string;
  bodyText: string;
  linkUrl: string | null;
  offerText: string | null;
  segment: MarketingSmsSegment;
  customRecipients: string[] | null;
  status: MarketingSmsStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  optedOutSkippedCount: number;
  failedRecipients: MarketingSmsFailedRecipient[] | null;
  segmentsPerMessage: number;
  totalSegmentsSent: number;
  createdAt: string;
  sentAt: string | null;
}

export function serializeSmsCampaign(id: string, data: MarketingSmsCampaign): SerializedMarketingSmsCampaign {
  return {
    id,
    name: data.name,
    bodyText: data.bodyText,
    linkUrl: data.linkUrl ?? null,
    offerText: data.offerText ?? null,
    segment: data.segment,
    customRecipients: data.customRecipients,
    status: data.status,
    recipientCount: data.recipientCount,
    sentCount: data.sentCount,
    failedCount: data.failedCount,
    optedOutSkippedCount: data.optedOutSkippedCount,
    failedRecipients: data.failedRecipients,
    segmentsPerMessage: data.segmentsPerMessage,
    totalSegmentsSent: data.totalSegmentsSent,
    createdAt: data.createdAt.toDate().toISOString(),
    sentAt: data.sentAt ? data.sentAt.toDate().toISOString() : null,
  };
}

export interface SerializedSmsOptOut {
  phoneNumber: string;
  source: SmsOptOut['source'];
  recordedBy: string | null;
  note: string | null;
  optedOutAt: string;
}

export function serializeSmsOptOut(data: SmsOptOut): SerializedSmsOptOut {
  return {
    phoneNumber: data.phoneNumber,
    source: data.source,
    recordedBy: data.recordedBy,
    note: data.note,
    optedOutAt: data.optedOutAt.toDate().toISOString(),
  };
}
