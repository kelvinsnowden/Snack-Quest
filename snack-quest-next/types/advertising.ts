import type { Timestamp } from 'firebase/firestore';

/**
 * Advertising on the machine's idle screen (§ IDLE / ATTRACT ADVERTISING
 * ENGINE). Advertisers book campaigns; campaigns play approved creatives on
 * the machines they target, on a schedule, weighted and frequency-capped;
 * machines report every play; revenue follows the campaign's price terms
 * and each machine owner's agreed share.
 */

export const ADVERTISER_KINDS = ['external', 'internal'] as const;
export type AdvertiserKind = (typeof ADVERTISER_KINDS)[number];

/** `advertisers`. `internal` is Snack Quest promoting itself (new snacks, offers) — never billed. */
export interface Advertiser {
  businessId: string;
  name: string;
  kind: AdvertiserKind;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  active: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Media a machine may play. Still images and two video containers — never HTML, scripts or anything a browser would execute. */
export const AD_MEDIA_TYPES = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
} as const;
export type AdMimeType = keyof typeof AD_MEDIA_TYPES;
/** Largest ad file that can go through our own upload route (Vercel caps a request body at 4.5 MB). */
export const AD_IN_BAND_MAX_BYTES = 4 * 1024 * 1024;
/** Largest ad video uploaded straight to storage and checked afterwards (§ AD SECURITY — direct upload). */
export const AD_DIRECT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export type AdMediaKind = (typeof AD_MEDIA_TYPES)[AdMimeType];

export const AD_CREATIVE_STATUSES = ['pending_review', 'approved', 'rejected'] as const;
export type AdCreativeStatus = (typeof AD_CREATIVE_STATUSES)[number];

/**
 * `adCreatives`. Uploaded through the creative upload route only, which
 * checks the bytes, computes `sha256` from them and stores the file — so
 * the checksum a machine verifies after download is the server's own, not
 * one a client claimed.
 */
export interface AdCreative {
  businessId: string;
  advertiserId: string;
  name: string;
  mimeType: AdMimeType;
  mediaKind: AdMediaKind;
  mediaUrl: string;
  bytes: number;
  sha256: string;
  /** Images: how long it shows. Videos: the length staff declared at upload (the server does not decode video); machines report the real play time. */
  durationSeconds: number;
  status: AdCreativeStatus;
  reviewedBy: string | null;
  reviewedAt: Timestamp | null;
  reviewNote: string | null;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const AD_CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'ended', 'cancelled'] as const;
export type AdCampaignStatus = (typeof AD_CAMPAIGN_STATUSES)[number];

export const AD_BILLING_MODELS = ['none', 'flat_monthly', 'per_machine_day', 'per_completed_play'] as const;
export type AdBillingModel = (typeof AD_BILLING_MODELS)[number];

export const AD_BILLING_LABEL: Record<AdBillingModel, string> = {
  none: 'Not billed',
  flat_monthly: 'Flat fee per calendar month running',
  per_machine_day: 'Per machine per day it played',
  per_completed_play: 'Per completed play',
};

/** When a campaign may play, in Nairobi time. */
export interface AdSchedule {
  /** `YYYY-MM-DD`, inclusive. */
  startDate: string;
  /** `YYYY-MM-DD`, inclusive; null runs until ended. */
  endDate: string | null;
  /** 0 = Sunday … 6 = Saturday. */
  daysOfWeek: number[];
  /** Minutes after midnight, Nairobi: plays when startMinute ≤ now < endMinute. */
  startMinute: number;
  endMinute: number;
}

export interface AdTargeting {
  allMachines: boolean;
  machineIds: string[];
  locationIds: string[];
  ownerPartnerIds: string[];
}

/** `adCampaigns`. */
export interface AdCampaign {
  businessId: string;
  advertiserId: string;
  advertiserKind: AdvertiserKind;
  name: string;
  status: AdCampaignStatus;
  creativeIds: string[];
  schedule: AdSchedule;
  targeting: AdTargeting;
  /** Relative share of idle-screen plays against other campaigns playing at the same time, 1–10. */
  weight: number;
  /** At most this many plays per machine per hour; null for no cap. */
  frequencyCapPerHour: number | null;
  billingModel: AdBillingModel;
  /** The price for one unit of the billing model (a month, a machine-day, a completed play); 0 when not billed. */
  priceKes: number;
  createdBy: string;
  publishedBy: string | null;
  publishedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const AD_PLAYBACK_EVENT_TYPES = ['scheduled', 'downloaded', 'started', 'completed', 'failed', 'interacted'] as const;
export type AdPlaybackEventType = (typeof AD_PLAYBACK_EVENT_TYPES)[number];

/** One thing that happened to one ad on one machine. */
export interface AdPlaybackEvent {
  campaignId: string;
  creativeId: string;
  eventType: AdPlaybackEventType;
  /** Unique within its batch. */
  clientEventId: string;
  /** The machine's clock — kept for ordering on the device, never trusted for money. */
  occurredAt: Timestamp;
  playedMs: number | null;
  failureReason: string | null;
}

/**
 * `adPlaybackBatches/{hash(machineId, batchId)}` — one machine's report of
 * a few minutes of playback, kept as the evidence behind the counts. The
 * id makes a resent batch a duplicate by construction: a machine that
 * retries after a dropped response is never double counted. One document
 * per flush, not per play, so a fleet of idle screens cycling short ads
 * stays affordable.
 */
export interface AdPlaybackBatch {
  businessId: string;
  machineId: string;
  batchId: string;
  /** Nairobi date the server received it — what daily stats and billing count by. */
  date: string;
  packageVersion: string | null;
  events: AdPlaybackEvent[];
  receivedAt: Timestamp;
}

/** `adDailyStats/{businessId}_{date}_{campaignId}_{machineId}` — counted once per unique event. */
export interface AdDailyStat {
  businessId: string;
  date: string;
  campaignId: string;
  machineId: string;
  scheduled: number;
  downloaded: number;
  started: number;
  completed: number;
  failed: number;
  interacted: number;
  playedMs: number;
  updatedAt: Timestamp;
}

/** One owner's cut of one campaign-month (§ OWNER AD REVENUE SHARE). */
export interface AdOwnerShare {
  partnerId: string;
  machineIds: string[];
  /** The machines' share of the campaign's delivery (completed plays) that month, 0–1. */
  deliveryShare: number;
  sharePct: number;
  amountKes: number;
}

/**
 * `adRevenueEntries/{businessId}_{campaignId}_{month}` — what a campaign
 * earned in a calendar month under its price terms, and how much of it
 * belongs to machine owners. Kept apart from product sales: ad revenue
 * never mixes with product margin.
 */
export interface AdRevenueEntry {
  businessId: string;
  campaignId: string;
  advertiserId: string;
  month: string;
  billingModel: AdBillingModel;
  unitPriceKes: number;
  /** Months, machine-days or completed plays, per the billing model. */
  billableUnits: number;
  grossKes: number;
  ownerShares: AdOwnerShare[];
  ownerTotalKes: number;
  snackQuestKes: number;
  completedPlays: number;
  computedAt: Timestamp;
  computedBy: string;
}
