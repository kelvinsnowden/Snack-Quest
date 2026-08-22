/**
 * Fargo Courier delivery: what it costs, and which service a customer
 * is even offered (§ Jumia to Fargo migration).
 *
 * The radius does not just set a price, it picks the delivery model.
 * That is the thing to hold on to, because two earlier passes at this
 * file got it wrong — first as a flat nationwide fee, then as a
 * zone-priced pickup network:
 *
 *   Inside the Nairobi radius   DOOR delivery. The customer types an
 *                               address; nothing is picked from a list.
 *                                 next day  KES 250
 *                                 same day  KES 439, ordered by 13:00,
 *                                           guaranteed by 18:00
 *
 *   Outside the radius          PICKUP at a Fargo branch, KES 450.
 *
 * So the metro branches are never shown to a customer. They exist in
 * the dataset because they are real Fargo locations, not because
 * anybody picks one — inside the radius the parcel comes to the door.
 *
 * Fargo now covers both methods. Bolt is gone: it only ever handled
 * Nairobi door delivery, and it handled it as an unpriced hand-off
 * arranged over WhatsApp with the fare paid to the rider. A door
 * service with a fixed price and a stated guarantee replaces that
 * outright, which also means door delivery is charged at checkout for
 * the first time rather than settled later between customer and rider.
 *
 * Same-day is only real before the cut-off, and the cut-off is Nairobi
 * time. These functions run in Cape Town, an hour behind, so a naive
 * local-hour check keeps same-day on sale until 14:00 Nairobi and sells
 * a 18:00 guarantee the courier has stopped accepting.
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

/**
 * Which delivery method a region gets. One function rather than a
 * condition repeated at checkout, in the station API and in the
 * conversation flow — the three places that would otherwise each have
 * their own idea of where the radius ends.
 */
export function deliveryMethodForRegion(region: FargoRegion): 'door' | 'pickup' {
  return region === 'nairobi-metro' ? 'door' : 'pickup';
}

/**
 * The towns Fargo treats as "Nairobi and surrounding" — the door-delivery
 * area, confirmed with the business.
 *
 * A named list rather than a county check, because the boundary does not
 * follow county lines: Nairobi county is entirely inside, while Kiambu
 * and Kajiado are only partly (Thika and Limuru are in, Tala is not).
 * A county test would either refuse Thika or promise door delivery to
 * Loitokitok, 200km away.
 */
const METRO_TOWNS = new Set(['Nairobi', 'Ruiru', 'Kiambu', 'Kikuyu', 'Limuru', 'Kitengela', 'Thika']);

/**
 * Whether an address qualifies for door delivery.
 *
 * All of Nairobi county qualifies whatever town is given, since the
 * whole county sits inside the radius and a customer typing an estate
 * name rather than "Nairobi" should not be pushed to a pickup point.
 * Outside it, the town has to be one Fargo actually serves.
 */
export function isMetroLocation(county: string | null | undefined, town?: string | null): boolean {
  if ((county ?? '').trim().toLowerCase() === 'nairobi') {
    return true;
  }
  return METRO_TOWNS.has((town ?? '').trim());
}

export function metroTowns(): string[] {
  return [...METRO_TOWNS];
}

/** A pickup point is only ever offered outside the radius; inside it, the parcel comes to the door. */
export function isCustomerFacingPickupPoint(region: FargoRegion): boolean {
  return deliveryMethodForRegion(region) === 'pickup';
}

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
