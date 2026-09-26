import type { Timestamp } from 'firebase/firestore';

/**
 * `machineOwnerInterests/{id}` — an application from the public `/own`
 * page's interactive qualification form (§ machine-owner
 * lead-generation landing page).
 *
 * Same sensitivity profile as `investorInterests` (named people, phone
 * numbers, and what commercial access each claims to have), so it gets
 * the same treatment: the security rule denies every client read and
 * write, and the Admin SDK behind `POST /api/machine-owners/interest`
 * is the only writer.
 */
export type CapitalRange = '250k_500k' | '500k_1m' | '1m_plus' | 'exploring';

export const CAPITAL_RANGES: readonly { value: CapitalRange; label: string; description?: string }[] = [
  { value: '250k_500k', label: 'KSh 250K – 500K' },
  { value: '500k_1m', label: 'KSh 500K – 1M' },
  { value: '1m_plus', label: 'KSh 1M+' },
  { value: 'exploring', label: 'I’m still exploring' },
] as const;

export type LocationAccess = 'yes' | 'not_yet' | 'looking' | 'multiple';

export const LOCATION_ACCESS_OPTIONS: readonly { value: LocationAccess; label: string; description: string }[] = [
  { value: 'yes', label: 'Yes', description: 'I already have a potential location.' },
  { value: 'not_yet', label: 'Not yet', description: 'But I have relationships that could open doors.' },
  { value: 'looking', label: 'I’m looking', description: 'I’d need help identifying a location.' },
  { value: 'multiple', label: 'Multiple', description: 'I have access to several potential locations.' },
] as const;

/** Only meaningful when `locationAccess` is `'multiple'` — how many potential locations, roughly. */
export type LocationCount = '1_2' | '3_5' | '6_10' | '10_plus';

export const LOCATION_COUNTS: readonly { value: LocationCount; label: string }[] = [
  { value: '1_2', label: '1–2' },
  { value: '3_5', label: '3–5' },
  { value: '6_10', label: '6–10' },
  { value: '10_plus', label: '10+' },
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

export type OwnerProfile = 'one_machine' | 'multiple_machines' | 'locations' | 'both';

export const OWNER_PROFILES: readonly { value: OwnerProfile; label: string; description: string }[] = [
  { value: 'one_machine', label: 'One machine', description: 'I want to start with one.' },
  { value: 'multiple_machines', label: 'Multiple machines', description: 'I want to build a larger footprint.' },
  { value: 'locations', label: 'Locations', description: 'I can help Snack Quest access locations.' },
  { value: 'both', label: 'Both', description: 'I have capital + location access.' },
] as const;

/** Only meaningful when `ownerProfile` is `'multiple_machines'` — whether they're already thinking in portfolio terms. */
export type BuildingPortfolio = 'yes' | 'exploring';

export const BUILDING_PORTFOLIO_OPTIONS: readonly { value: BuildingPortfolio; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'exploring', label: 'Still exploring' },
] as const;

export interface MachineOwnerInterest {
  fullName: string;
  whatsapp: string;
  /** Optional — the applicant's own reachability is the WhatsApp number; email is a convenience, not a gate. */
  email: string | null;
  capitalRange: CapitalRange;
  locationAccess: LocationAccess;
  /** Only asked when `locationAccess` is `'multiple'`. Null otherwise — never a fabricated default. */
  locationCount: LocationCount | null;
  /** Empty when nothing was selected — the multi-select step is never made mandatory (§ "not unnecessarily rejecting prospects"). */
  locationTypes: LocationType[];
  ownerProfile: OwnerProfile;
  /** Only asked when `ownerProfile` is `'multiple_machines'`. Null otherwise. */
  buildingPortfolio: BuildingPortfolio | null;
  /** A salted hash of the submitting IP, never the address itself — see `InvestorInterest.submitterHash`'s own doc comment for why. */
  submitterHash: string;
  status: MachineOwnerInterestStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Every submission lands as `new`; the rest exist so this list can be worked, not merely collected. */
export type MachineOwnerInterestStatus = 'new' | 'contacted' | 'in-conversation' | 'declined' | 'closed';
