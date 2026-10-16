import type { Timestamp } from 'firebase/firestore';

/**
 * `vendingLeads/{id}` — one person interested in the vending programme,
 * wherever they came from (§ vending leads CRM).
 *
 * Two sources feed it today:
 * - `meta_sheet`: a Meta lead-form submission, pushed in from the
 *   Google Sheet Meta writes to (`POST /api/leads/sheet`). Doc id is
 *   `meta_<lead id>`, so the same row sent twice updates, never
 *   duplicates.
 * - `own_form`: an application from the public `/own` page, mirrored
 *   from `machineOwnerInterests`. Doc id is `own_<interest id>`.
 *
 * Same sensitivity as `machineOwnerInterests` (names, phone numbers),
 * so the security rule denies every client read and write; the Admin
 * SDK is the only reader and writer.
 *
 * Fields that came from the source (`fullName`, `answers`, ...) are
 * refreshed on every re-sync. The working fields (`status`, `segment`,
 * `notes`, `nextFollowUpAt`) are only ever set here in the admin, so a
 * re-sync never undoes what somebody recorded.
 */
export type VendingLeadSource = 'meta_sheet' | 'own_form';

export const VENDING_LEAD_SOURCE_LABELS: Record<VendingLeadSource, string> = {
  meta_sheet: 'Meta lead form',
  own_form: 'Website /own form',
};

export type VendingLeadStatus = 'new' | 'contacted' | 'qualified' | 'site_visit' | 'won' | 'lost';

/** In pipeline order — the admin renders tabs and the status picker from this. */
export const VENDING_LEAD_STATUSES: readonly { value: VendingLeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'site_visit', label: 'Site visit / meeting' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
] as const;

export type VendingLeadSegment = 'investor' | 'host' | 'unknown';

export const VENDING_LEAD_SEGMENTS: readonly { value: VendingLeadSegment; label: string }[] = [
  { value: 'investor', label: 'Investor / owner' },
  { value: 'host', label: 'Host / location' },
  { value: 'unknown', label: 'Not sure yet' },
] as const;

export interface VendingLeadNote {
  text: string;
  /** Staff uid of whoever wrote it. */
  by: string;
  byName: string | null;
  atMs: number;
}

/** The part of a lead that comes from its source and is refreshed on every sync. */
export interface VendingLeadSourceFields {
  source: VendingLeadSource;
  /** Meta's lead id, or the `machineOwnerInterests` doc id. */
  externalId: string;
  fullName: string;
  /** `2547XXXXXXXX` when it parsed as a Kenyan mobile, otherwise the digits as given. Empty when none was supplied. */
  phone: string;
  email: string | null;
  campaignName: string | null;
  adName: string | null;
  formName: string | null;
  /** `fb` / `ig` from Meta, null otherwise. */
  platform: string | null;
  /** Every other question and answer, label → value, in the order the source gave them. */
  answers: { label: string; value: string }[];
  /** When the person actually submitted, from the source — epoch ms. */
  submittedAtMs: number;
}

/** Where a lead is in the automated nurture emails (§ lead nurture). Absent until the first email goes out. */
export interface VendingLeadNurture {
  /** How many sequence emails have been sent. */
  sent: number;
  lastSentAtMs: number | null;
  /** Set once the sequence will send nothing more: finished, booked, unsubscribed, or stopped by staff. */
  stoppedReason: 'finished' | 'booked' | 'unsubscribed' | 'staff' | null;
}

/** A WhatsApp call the lead booked from the link in their emails. */
export interface VendingLeadCall {
  /** Start of the 30-minute slot, epoch ms. */
  atMs: number;
  bookedAtMs: number;
  /** The number to call — the lead can correct it while booking. */
  whatsapp: string;
  reminderSentAtMs: number | null;
}

export interface VendingLead extends VendingLeadSourceFields {
  status: VendingLeadStatus;
  segment: VendingLeadSegment;
  notes: VendingLeadNote[];
  /** Epoch ms, or null when no follow-up is scheduled. */
  nextFollowUpAtMs: number | null;
  nurture?: VendingLeadNurture;
  /** Set when the lead asked for no more emails. Never cleared by a re-sync. */
  emailOptOutAtMs?: number | null;
  call?: VendingLeadCall | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
