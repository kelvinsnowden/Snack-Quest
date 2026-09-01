/**
 * Delivery: what it costs, who carries it, and which service a customer
 * is even offered (§ Jumia to Fargo migration).
 *
 * One courier, Tushop, and one boundary that decides how a parcel
 * reaches the customer. That is why this file is named for the concern
 * rather than for a courier — it was `fargoPricing` until it turned out
 * Fargo is Tushop's partner rather than Snack Quest's.
 *
 * The radius does not just set a price, it picks the delivery model.
 * That is the thing to hold on to, because two earlier passes at this
 * file got it wrong — first as a flat nationwide fee, then as a
 * zone-priced pickup network:
 *
 *   Inside the Nairobi radius   DOOR delivery by Tushop. The customer
 *                               types an address; nothing is picked
 *                               from a list.
 *                                 next day  KES 250, by 16:00 next day
 *                                 same day  KES 300, ordered by 13:00,
 *                                           guaranteed by 18:00
 *                                 express   KES 500, collected and
 *                                           delivered within 90 minutes
 *
 *   Outside the radius          PICKUP at a Fargo branch, KES 450.
 *                               Still handed to Tushop; Fargo is their
 *                               onward partner, not Snack Quest's.
 *
 * So the metro branches are never shown to a customer. They exist in
 * the dataset because they are real Fargo locations, not because
 * anybody picks one — inside the radius the parcel comes to the door.
 *
 * Bolt is gone: it only ever handled Nairobi door delivery, and it
 * handled it as an unpriced hand-off arranged over WhatsApp with the
 * fare paid to the rider. Tushop's door service has a fixed price and a
 * stated guarantee, which also means door delivery is charged at
 * checkout for the first time rather than settled later between
 * customer and rider.
 *
 * Same-day is only real before the cut-off, and the cut-off is Nairobi
 * time. These functions run in Cape Town, an hour behind, so a naive
 * local-hour check keeps same-day on sale until 14:00 Nairobi and sells
 * a 18:00 guarantee the courier has stopped accepting.
 *
 * Neither fast service runs on a Sunday, because both depend on a
 * same-afternoon dispatch that does not happen. Next-day is untouched
 * by that: an order placed on Sunday is packed and moves on Monday,
 * which is what it already promises. The weekday is read in Nairobi
 * time for the same reason the hour is, and the drift bites harder
 * here — near midnight the two clocks disagree about the *day*.
 */

/**
 * The one company Snack Quest hands boxes to, for every order.
 *
 * Tushop delivers to the door inside the Nairobi radius themselves, and
 * uses their own partnership with Fargo Courier to reach everywhere
 * else. That relationship is Tushop's, not Snack Quest's — the
 * warehouse hands every parcel to Tushop and Tushop handles the rest.
 *
 * So the courier on a shipment, and in the pricing key
 * (`zone + shippingOrigin + packageCategory + courier`), is always
 * Tushop. Fargo appears in this codebase only as the branch network a
 * customer physically collects from, which is why pickup points are
 * still named for it.
 */
export const DELIVERY_COURIER = 'tushop';

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

/**
 * The door-delivery area written out for a customer to read.
 *
 * Exists because "Nairobi door delivery" cost a real sale: someone in
 * Thika read it, concluded they were not covered, went looking for a
 * Fargo station — and there is none, because Thika is inside the
 * radius and gets door delivery. Naming the towns is the difference
 * between a customer who orders and one who asks support whether they
 * can. Nairobi leads because it is the anchor everyone recognises.
 */
export function metroAreaLabel(): string {
  const rest = [...METRO_TOWNS].filter((town) => town !== 'Nairobi');
  return `Nairobi, ${rest.slice(0, -1).join(', ')} & ${rest.at(-1)}`;
}

/**
 * Whether a search term a customer typed into the pickup-point picker
 * is actually a door-delivery town — the exact dead end that sent one
 * to support: searching "Thika", finding nothing, and being told to
 * "try a town name instead".
 */
export function matchesMetroTown(query: string): string | null {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return null;
  }
  return [...METRO_TOWNS].find((town) => town.toLowerCase() === needle) ?? null;
}

/** A pickup point is only ever offered outside the radius; inside it, the parcel comes to the door. */
export function isCustomerFacingPickupPoint(region: FargoRegion): boolean {
  return deliveryMethodForRegion(region) === 'pickup';
}

/** What the customer picks. Only meaningful inside the metro; upcountry has one speed. */
export const FARGO_SERVICE_LEVELS = ['next-day', 'same-day', 'express'] as const;
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
  'nairobi-metro:express': 'Nairobi Metro — Express',
  'upcountry:next-day': 'Upcountry',
  // Fargo does not offer same-day beyond the metro. Mapped to the same
  // zone as next-day so an out-of-range request prices as the only
  // service that exists rather than falling through to no rule at all.
  'upcountry:same-day': 'Upcountry',
  // Express is a 90-minute city service; there is no upcountry
  // equivalent. Same fallback for the same reason.
  'upcountry:express': 'Upcountry',
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
  'Nairobi Metro — Same Day': 300,
  'Nairobi Metro — Express': 500,
  Upcountry: 450,
};

/**
 * What a WhatsApp door order gets.
 *
 * Next-day, always. The web checkout can offer same-day because it can
 * see the clock at the moment of ordering and withdraw the option after
 * 13:00; a WhatsApp conversation can sit unanswered for hours between
 * the customer choosing and actually paying, so promising a same-day
 * arrival there would be promising something the elapsed time could
 * already have made impossible.
 */
export const WHATSAPP_DOOR_SERVICE_LEVEL: FargoServiceLevel = 'next-day';

/** The hour, in Nairobi time, after which same-day can no longer be promised. */
export const SAME_DAY_CUTOFF_HOUR = 13;

/**
 * The hours, in Nairobi time, between which express may be sold.
 *
 * Express is a window, not a cut-off, which is what makes it different
 * from same-day. Same-day has one boundary — order before 13:00 and it
 * arrives by 18:00 — so any earlier hour is fine. Express promises
 * collection and delivery inside 90 minutes, and that promise needs a
 * rider on the road now, so it also has a floor: before 10:00 there is
 * nobody to dispatch, and an order taken at 09:30 would be a
 * 90-minute guarantee against a run that has not started.
 *
 * Closing at 13:00 alongside same-day is deliberate rather than
 * incidental: the two share the same afternoon dispatch, so the point
 * where same-day stops being promisable is also the point where an
 * express run stops being schedulable.
 *
 * Confirmed with the business. Both bounds are named constants so the
 * window can move without touching the logic that reads it.
 */
export const EXPRESS_OPEN_HOUR = 10;
export const EXPRESS_CUTOFF_HOUR = 13;

/** What express actually promises, in minutes, stated once for the checkout copy. */
export const EXPRESS_DELIVERY_MINUTES = 90;

/** What same-day actually guarantees, stated once so the checkout copy and any later SLA check agree. */
export const SAME_DAY_ARRIVAL_HOUR = 18;

/** What next-day guarantees. Stated here for the same reason: the checkout copy reads it rather than hard-coding an hour that could drift from the courier's terms. */
export const NEXT_DAY_ARRIVAL_HOUR = 16;

/**
 * The speed written out for a person to read (§ order delivery speed).
 *
 * One definition, so the admin order page, the orders list and the
 * new-order alert cannot describe the same order three different ways.
 * Null covers both pickup, which has one speed, and every order placed
 * before the field existed — neither is a next-day order, and
 * defaulting them to one would invent a fact.
 */
export function serviceLevelLabel(level: FargoServiceLevel | null | undefined): string | null {
  switch (level) {
    case 'next-day':
      return 'Next day';
    case 'same-day':
      return 'Same day';
    case 'express':
      return 'Express';
    default:
      return null;
  }
}

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

/** The Nairobi wall-clock hour, which is not the hour this code runs in. */
function nairobiHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Africa/Nairobi',
    }).format(now),
  );
}

/**
 * The Nairobi weekday, which near midnight is not the weekday this
 * code runs in.
 *
 * The same hour's drift that shifts the cut-offs also shifts the
 * *day*: at 00:30 on Monday in Nairobi it is still 23:30 on Sunday
 * where this runs, so a naive `getDay()` would refuse same-day to the
 * first customers of the week, and again at 00:30 Sunday it would
 * still be selling Saturday's service.
 */
function nairobiWeekday(now: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    timeZone: 'Africa/Nairobi',
  }).format(now);
}

/**
 * The day the fast services do not run.
 *
 * Same-day and express both depend on a dispatch that happens the same
 * afternoon, and that does not happen on a Sunday. Next-day is
 * unaffected: an order placed on Sunday is packed and moves on Monday,
 * which is exactly what it already promises.
 */
const NO_FAST_DELIVERY_WEEKDAY = 'Sunday';

/**
 * Whether the fast services run at all today, before any question of
 * what time it is.
 *
 * Kept separate from the cut-offs deliberately. "It is Sunday" and "it
 * is past 1pm" are different reasons to refuse, and a customer told
 * the wrong one acts on it — waiting until tomorrow morning for a
 * cut-off that was never the problem.
 */
export function isFastDeliveryDay(now: Date = new Date()): boolean {
  return nairobiWeekday(now) !== NO_FAST_DELIVERY_WEEKDAY;
}

/**
 * Whether express may be offered right now.
 *
 * Both bounds matter, and the opening one is the easier to forget: a
 * cut-off-only check would put express on sale at 03:00 and promise a
 * 90-minute delivery to someone who would still be waiting at dawn.
 *
 * Evaluated against Nairobi's clock, same trap as same-day. The
 * runtime's own clock is an hour behind, which here would shift the
 * whole window — opening express at 11:00 Nairobi and still selling it
 * at 14:00, an hour past the last dispatch.
 */
export function isExpressAvailableAt(now: Date = new Date()): boolean {
  return expressWindowStateAt(now) === 'open';
}

/**
 * Which side of the express window the clock is on.
 *
 * A boolean is enough to decide whether to sell express, but not enough
 * to say anything useful to the customer about it: "closed for today"
 * is simply wrong at 08:00, when express opens in two hours. This is
 * the same question `isExpressAvailableAt` asks, answered with the one
 * extra bit the copy needs, so the checkout never has to work out
 * Nairobi's hour for itself.
 */
export function expressWindowStateAt(
  now: Date = new Date(),
): 'before' | 'open' | 'after' | 'closed_today' {
  // Checked before the clock: on a Sunday the hour is irrelevant, and
  // "opens at 10am" would be a promise for a service that is not
  // running at all today.
  if (!isFastDeliveryDay(now)) {
    return 'closed_today';
  }
  const hour = nairobiHour(now);
  // An unreadable clock should not put a 90-minute promise on sale.
  if (!Number.isFinite(hour) || hour >= EXPRESS_CUTOFF_HOUR) {
    return 'after';
  }
  return hour < EXPRESS_OPEN_HOUR ? 'before' : 'open';
}

/**
 * Which side of the same-day cut-off the clock is on, or whether the
 * service runs today at all.
 *
 * Same shape and same reason as `expressWindowStateAt`: the screen has
 * to say "not on Sundays" rather than "closed for today, order by
 * 1pm", which would send someone away to try again before a deadline
 * that is not what stopped them.
 */
export function sameDayWindowStateAt(now: Date = new Date()): 'open' | 'after' | 'closed_today' {
  if (!isFastDeliveryDay(now)) {
    return 'closed_today';
  }
  const hour = nairobiHour(now);
  return Number.isFinite(hour) && hour < SAME_DAY_CUTOFF_HOUR ? 'open' : 'after';
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
  return sameDayWindowStateAt(now) === 'open';
}

/**
 * Same-day and express exist in the metro only, only on a day they
 * run, and only inside their own windows. Ordered slowest to fastest,
 * which is also cheapest to dearest, so the checkout list reads as a
 * ladder. On a Sunday that ladder is one rung: next-day, which is the
 * one service whose promise a Sunday does not change.
 */
export function availableServiceLevels(region: FargoRegion, now: Date = new Date()): FargoServiceLevel[] {
  if (region !== 'nairobi-metro') {
    return ['next-day'];
  }
  const levels: FargoServiceLevel[] = ['next-day'];
  if (isSameDayAvailableAt(now)) {
    levels.push('same-day');
  }
  if (isExpressAvailableAt(now)) {
    levels.push('express');
  }
  return levels;
}
