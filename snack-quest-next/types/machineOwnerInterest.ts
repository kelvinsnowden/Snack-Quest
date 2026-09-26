import type { Timestamp } from 'firebase/firestore';

/**
 * `machineOwnerInterests/{id}` — a non-binding application from the
 * public `/own` page (§ machine-owner lead-generation landing page).
 *
 * Same sensitivity profile as `investorInterests` (named people, phone
 * numbers, and what commercial access each claims to have), so it gets
 * the same treatment: the security rule denies every client read and
 * write, and the Admin SDK behind `POST /api/machine-owners/interest`
 * is the only writer.
 */
export type CapitalRange = '250k_500k' | '500k_1m' | '1m_plus';

export const CAPITAL_RANGES: readonly { value: CapitalRange; label: string }[] = [
  { value: '250k_500k', label: 'KSh 250K – 500K' },
  { value: '500k_1m', label: 'KSh 500K – 1M' },
  { value: '1m_plus', label: 'KSh 1M+' },
] as const;

export type LocationAccess = 'yes' | 'no' | 'multiple';

export const LOCATION_ACCESS_OPTIONS: readonly { value: LocationAccess; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'multiple', label: 'I have access to multiple locations' },
] as const;

export type LocationType = 'mall' | 'office' | 'hotel' | 'university' | 'hospital' | 'apartment' | 'bnb' | 'transport_hub' | 'other';

export const LOCATION_TYPES: readonly { value: LocationType; label: string }[] = [
  { value: 'mall', label: 'Mall' },
  { value: 'office', label: 'Office' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'university', label: 'University' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'bnb', label: 'BnB' },
  { value: 'transport_hub', label: 'Transport hub' },
  { value: 'other', label: 'Other' },
] as const;

export type OwnerProfile = 'one_machine' | 'multiple_machines' | 'has_locations' | 'has_capital' | 'both';

export const OWNER_PROFILES: readonly { value: OwnerProfile; label: string }[] = [
  { value: 'one_machine', label: 'I want to own one machine' },
  { value: 'multiple_machines', label: 'I want to build multiple machines' },
  { value: 'has_locations', label: 'I have locations' },
  { value: 'has_capital', label: 'I have capital' },
  { value: 'both', label: 'I have both capital and locations' },
] as const;

export interface MachineOwnerInterest {
  fullName: string;
  whatsapp: string;
  /** Optional — the applicant's own reachability is the WhatsApp number; email is a convenience, not a gate. */
  email: string | null;
  capitalRange: CapitalRange;
  locationAccess: LocationAccess;
  /** Empty when `locationAccess` is `'no'`. */
  locationTypes: LocationType[];
  ownerProfile: OwnerProfile;
  /** A salted hash of the submitting IP, never the address itself — see `InvestorInterest.submitterHash`'s own doc comment for why. */
  submitterHash: string;
  status: MachineOwnerInterestStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Every submission lands as `new`; the rest exist so this list can be worked, not merely collected. */
export type MachineOwnerInterestStatus = 'new' | 'contacted' | 'in-conversation' | 'declined' | 'closed';
