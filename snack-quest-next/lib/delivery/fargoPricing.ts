/**
 * Fargo Courier pickup pricing (§ Jumia to Fargo migration).
 *
 * Replaces `jumiaZones.ts`, and is deliberately much smaller than what
 * it replaces. Jumia priced by a six-band commercial zone table; Fargo
 * is billed at one nationwide rate, so there is exactly one price to
 * look up and no locality-to-zone classification to maintain.
 *
 * The zone machinery underneath is kept rather than torn out —
 * `deliveryZoneRules`, the admin pricing screen, and the
 * denormalisation onto `pickupStations.deliveryFeeKes` all still work
 * the same way. A flat rate is modelled as a single zone every station
 * belongs to, which means going back to banded pricing later is a data
 * change, not a rewrite.
 *
 * The rate itself is NOT hardcoded here. It lives in
 * `deliveryZoneRules` where an admin sets it, for the same reason the
 * Jumia figures eventually moved there: a price a customer is charged
 * should be changeable by the person who negotiated it, without a
 * deploy.
 */

/**
 * The single zone every Fargo pickup point belongs to.
 *
 * A named constant rather than a bare string because it is the join
 * key between a station and its price — `pickupStations.zone` and
 * `deliveryZoneRules.zone` have to agree exactly or the station reads
 * as unpriceable and checkout refuses to sell it.
 */
export const FARGO_NATIONWIDE_ZONE = 'Nationwide';

/** Every parcel leaves from the Nairobi hub. Recorded on each station so the pricing key is complete, not because more than one origin exists. */
export const FARGO_SHIPPING_ORIGIN = 'Nairobi';

/**
 * Snack Quest boxes are all small parcels — the largest is
 * 400 x 300 x 120mm, well inside any courier's small-package ceiling.
 * Carried through as part of the pricing key so a future size tier is
 * a new rule rather than a new code path.
 */
export const FARGO_PACKAGE_CATEGORY = 'small';

export const FARGO_COURIER = 'fargo';

/**
 * Whether a station can actually be sold to.
 *
 * The Jumia equivalent (`isJumiaZone`) existed because Jumia left some
 * stations unclassified, and an unclassified station has an unknown
 * cost — selling it meant shipping at a price nobody knew. The same
 * risk survives the migration in a different shape: a Fargo point
 * seeded before the nationwide rate is configured has no price either.
 *
 * So this stays a real gate rather than becoming `return true`. A
 * station that is not on the nationwide zone is refused at checkout,
 * which is the behaviour that stopped every pickup order shipping free.
 */
export function isFargoZone(value: string | null | undefined): value is typeof FARGO_NATIONWIDE_ZONE {
  return value === FARGO_NATIONWIDE_ZONE;
}
