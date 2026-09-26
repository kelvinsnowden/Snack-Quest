import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * `locations/{locationId}` — the commercial intelligence unit
 * (§ LOCATION IS THE INTELLIGENCE UNIT, docs/SNACK_INTELLIGENCE.md).
 *
 * A `Machine` is a physical device; a `Location` is the site it sits
 * in. `Machine.locationId` already existed
 * (`docs/FLEET_ARCHITECTURE_AUDIT.md` §6) as a bare string with no
 * backing collection — flagged as MISSING in
 * `docs/VENDING_OS_BENCHMARK.md` §0's own gap analysis. This is that
 * collection, additive: no existing field on `Machine` changes shape,
 * `locationId` simply now has somewhere real to resolve to.
 *
 * **One location can hold more than one machine.** Nothing here or in
 * `locationService`/`locationIntelligenceService` assumes a 1:1
 * mapping — `machineRepository.listByLocation` (§ locationService) is
 * the one query every "this location's machines" read goes through,
 * and it can return any number of rows, including zero for a location
 * profiled ahead of its first machine being installed.
 *
 * Every attribute here is a real, staff-recorded fact about the site
 * — never a performance conclusion. "This location does well with
 * Asian snacks" is something `locationIntelligenceService` *calculates*
 * from real transaction/rollup data (§ LOCATION DNA); it is never
 * stored as a field here, because a stored conclusion goes stale the
 * moment the data that justified it changes, and nothing would ever
 * update it back.
 */
export type LocationType =
  | 'university'
  | 'hotel'
  | 'office'
  | 'hospital'
  | 'mall'
  | 'airport'
  | 'transport_hub'
  | 'bnb'
  | 'corporate'
  | 'other';

export type LocationCustomerType = 'students' | 'employees' | 'travelers' | 'patients_and_visitors' | 'general_public' | 'mixed' | 'other';

/**
 * § PART 7 — OWNER VS LOCATION ECONOMICS. Every field is null until
 * an owner records it — never defaulted to `0`, which would silently
 * claim "no rent" for a site nobody has actually entered a figure
 * for. Recurring monthly costs (`rentKes`/`electricityKes`) are kept
 * separate from a one-off `placementFeeKes` because conflating the
 * two would make a location's monthly cost picture wrong the very
 * month a placement fee happened to be paid.
 */
export interface LocationOwnerExpenses {
  monthlyRentKes: number | null;
  placementFeeKes: number | null;
  monthlyElectricityKes: number | null;
  /** The site's own cut, as a percentage of revenue — a commission arrangement, distinct from a flat rent. */
  locationCommissionPct: number | null;
  updatedAt: Timestamp;
}

export interface Location extends AuditFields {
  businessId: string;
  name: string;
  locationType: LocationType;
  city: string;
  area: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /**
   * A staff estimate, never derived from transaction volume — conflating
   * "how many people pass by" with "how many people bought something"
   * would make foot traffic a restatement of revenue instead of an
   * independent fact a location's conversion rate could be measured
   * against. Null until someone actually estimates it.
   */
  estimatedFootTraffic: number | null;
  operatingHours: string | null;
  customerType: LocationCustomerType | null;
  indoorOutdoor: 'indoor' | 'outdoor' | 'mixed' | null;
  /**
   * The owner's own site-hosting costs (§ PART 7 — OWNER VS LOCATION
   * ECONOMICS) — rent, a one-off/recurring placement fee, electricity,
   * and a location-commission percentage the site itself charges the
   * owner. Owner-entered and owner-visible only; deliberately never
   * read by `machineSettlementService` — Snack Quest's own machine
   * economics stay `revenue - COGS - subscription = distributable
   * profit` regardless of what's recorded here (§ MACHINE ECONOMICS
   * default). An owner factors these into their *own* profitability
   * separately; Snack Quest never becomes responsible for them just
   * because they were entered.
   */
  expenses: LocationOwnerExpenses | null;
  /** Free-text notes on what else is physically nearby — not a structured directory integration, which does not exist. */
  nearbyBusinesses: string[];
  /** Competing food/beverage outlets specifically — kept distinct from `nearbyBusinesses` because it is the one category that actually matters for assortment/pricing decisions. */
  competingFoodBeverageOutlets: string[];
  /** Null until a machine has actually gone live here — a location can be profiled ahead of its first installation. */
  launchDate: Timestamp | null;
  notes: string | null;
}
