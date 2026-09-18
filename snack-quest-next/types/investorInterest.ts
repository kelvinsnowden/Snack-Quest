import type { Timestamp } from 'firebase/firestore';

/**
 * `investorInterests/{id}` — a non-binding expression of interest from
 * the public `/invest` page (§ investor interest page).
 *
 * Business-sensitive in a way a review is not: it is a list of named
 * people, their phone numbers, and roughly what each might put in. The
 * security rule on this collection is an unconditional deny for every
 * client, read and write alike — the Admin SDK behind
 * `POST /api/invest/interest` is the only writer, and there is
 * deliberately no public read path of any kind.
 *
 * Nothing here is a commitment. `indicativeAmount` is free text on
 * purpose: it is a conversation opener, not a subscription, and
 * storing it as a number would invite it to be summed into a total
 * that nobody has actually promised.
 */
export type InvestorType =
  | 'individual'
  | 'angel'
  | 'business-owner'
  | 'strategic'
  | 'creator'
  | 'other';

export const INVESTOR_TYPES: readonly { value: InvestorType; label: string }[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'angel', label: 'Angel investor' },
  { value: 'business-owner', label: 'Business owner' },
  { value: 'strategic', label: 'Strategic investor' },
  { value: 'creator', label: 'Creator' },
  { value: 'other', label: 'Other' },
] as const;

export interface InvestorInterest {
  fullName: string;
  email: string;
  /** E.164, normalised through the same helper the checkout uses. */
  phone: string;
  location: string;
  /** Free text — "around 500K", "1–2M", "depends on the terms". */
  indicativeAmount: string | null;
  investorType: InvestorType;
  motivation: string | null;
  heardFrom: string | null;
  /** Opted in to future updates. Absent consent is recorded as `false`, never assumed. */
  wantsUpdates: boolean;
  /**
   * Where the visitor came from, for the same reason the checkout
   * records it: knowing whether interest arrives from WhatsApp, TikTok
   * or a QR code at an event is the difference between repeating what
   * worked and guessing.
   */
  referrer: string | null;
  /**
   * A salted hash of the submitting IP, never the address itself.
   *
   * Enough to count repeat submissions from one origin for the rate
   * limit, and useless for identifying anyone — which matters because
   * this collection already holds a name, an email and a phone number,
   * and an IP alongside those is a meaningful escalation in what a
   * leak would cost.
   */
  submitterHash: string;
  status: InvestorInterestStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Where the conversation has got to. Every submission lands as `new`;
 * the rest exist so this list can be worked rather than merely
 * collected.
 */
export type InvestorInterestStatus = 'new' | 'contacted' | 'in-conversation' | 'declined' | 'closed';
