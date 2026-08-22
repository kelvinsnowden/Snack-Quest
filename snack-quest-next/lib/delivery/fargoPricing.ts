/**
 * Fargo Courier pickup pricing (§ Jumia to Fargo migration).
 *
 * Three rates, not one. An earlier pass modelled this as a flat
 * nationwide fee; the real card the business negotiated has a
 * geographic split and, inside Nairobi, a speed the customer chooses:
 *
 *   Upcountry (beyond the Nairobi radius)   KES 450
 *   Nairobi metro, next day                 KES 250
 *   Nairobi metro, same day                 KES 439
 *
 * Two consequences follow from that shape, and both are why this file
 * is more than a lookup table.
 *
 * **Speed is not a property of the pickup point.** The same Nairobi
 * branch can be served next day or same day, so the rate cannot be
 * read off the station alone the way Jumia's zone could. A station
 * carries its `region`; the customer's chosen `serviceLevel` completes
 * the key at checkout.
 *
 * **Same day is only real before the cut-off.** It is guaranteed to
 * arrive by 18:00 and only if the order is placed by 13:00, so
 * offering it at 4pm would be selling a promise that cannot be kept.
 * `isSameDayAvailableAt` is the gate, and it is evaluated in Nairobi
 * time rather than the server's — this app runs in Cape Town, an hour
 * behind, which would otherwise keep same-day on sale for an hour
 * after the courier stopped accepting it.
 */

export const FARGO_COURIER = 'fargo';

/** Every parcel leaves from the Nairobi hub. Part of the pricing key so a second origin later is a new rule, not a new code path. */
export const FARGO_SHIPPING_ORIGIN = 'Nairobi';

/**
 * Snack Quest boxes are all small parcels — the largest is
 * 400 x 300 x 120mm. Carried through so a future size tier is a new
 * rule rather than a new branch.
 */
export const FARGO_PACKAGE_CATEGORY = 'small';

/**
 * Which side of the Nairobi radius a pickup point sits on. A coarse
 * two-value split because that is exactly what the rate card
 * distinguishes — inventing finer bands would imply pricing precision
 * the courier does not actually offer.
 */
export const FARGO_REGIONS = ['nairobi-metro', 'upcountry'] as const;
export type FargoRegion = (typeof FARGO_REGIONS)[number];

/** What the customer picks. Only meaningful inside the metro; upcountry has one speed. */
export const FARGO_SERVICE_LEVELS = ['next-day', 'same-day'] as const;
export type FargoServiceLevel = (typeof FARGO_SERVICE_LEVELS)[number];

/**
 * The zone strings that reach `deliveryZoneRules` and
 * `pickupStations.zone`.
 *
 * Composed from region and service level rather than stored as two
 * columns, because the existing pricing key
 * (`zone + shippingOrigin + packageCategory + courier`) has no slot
 * for speed, and widening that key would touch the admin pricing
 * screen, the repository and every existing rule. A composed string
 * keeps one source of truth for a price and leaves that machinery
 * alone.
 */
export const FARGO_ZONES = {
  'nairobi-metro:next-day': 'Nairobi Metro — Next Day',
  'nairobi-metro:same-day': 'Nairobi Metro — Same Day',
  'upcountry:next-day': 'Upcountry',
  // Fargo does not offer same-day beyond the metro. Mapped to the same
  // zone as next-day so an out-of-range request prices as the only
  // service that exists rather than falling through to no rule at all.
  'upcountry:same-day': 'Upcountry',
} as const satisfies Record<`${FargoRegion}:${FargoServiceLevel}`, string>;

export type FargoZone = (typeof FARGO_ZONES)[keyof typeof FARGO_ZONES];

/**
 * The rates as the business negotiated them.
 *
 * Present here as the seed value and the thing tests assert against,
 * NOT as the figure charged at request time — that is read from
 * `deliveryZoneRules`, so a price change is an admin edit rather than
 * a deploy. Same discipline the Jumia card ended up under.
 */
export const FARGO_SEED_FEES_KES: Record<FargoZone, number> = {
  'Nairobi Metro — Next Day': 250,
  'Nairobi Metro — Same Day': 439,
  Upcountry: 450,
};

/** The hour, in Nairobi time, after which same-day can no longer be promised. */
export const SAME_DAY_CUTOFF_HOUR = 13;

/** What same-day actually guarantees, stated once so the checkout copy and any later SLA check agree. */
export const SAME_DAY_ARRIVAL_HOUR = 18;

export function fargoZoneFor(region: FargoRegion, serviceLevel: FargoServiceLevel): FargoZone {
  return FARGO_ZONES[`${region}:${serviceLevel}`];
}

/** Every zone string a rule may legitimately carry — deduplicated, since upcountry maps twice. */
export function allFargoZones(): FargoZone[] {
  return [...new Set(Object.values(FARGO_ZONES))];
}

/**
 * Whether a station's stored zone is one this codebase can price.
 *
 * Kept as a real gate rather than `return true`, for the reason its
 * Jumia predecessor existed: a point seeded before its rate is
 * configured has an unknown cost, and selling it would repeat the bug
 * where every pickup order silently shipped free.
 */
export function isFargoZone(value: string | null | undefined): value is FargoZone {
  return typeof value === 'string' && (allFargoZones() as string[]).includes(value);
}

/**
 * Whether same-day may be offered right now.
 *
 * Evaluated against Nairobi's wall clock, deliberately. The runtime's
 * own clock is whatever region the function happens to run in — Cape
 * Town today — and an hour's drift here means selling a 6pm guarantee
 * the courier will not accept.
 */
export function isSameDayAvailableAt(now: Date = new Date()): boolean {
  const nairobiHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Africa/Nairobi',
    }).format(now),
  );
  return Number.isFinite(nairobiHour) && nairobiHour < SAME_DAY_CUTOFF_HOUR;
}

/** Same-day exists in the metro only, and only before the cut-off. */
export function availableServiceLevels(region: FargoRegion, now: Date = new Date()): FargoServiceLevel[] {
  if (region !== 'nairobi-metro') {
    return ['next-day'];
  }
  return isSameDayAvailableAt(now) ? ['next-day', 'same-day'] : ['next-day'];
}
