import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { deliveryZoneRuleRepository } from '@/repositories/deliveryZoneRuleRepository';

/**
 * The cheapest delivery on offer, for "delivery starts at KES 250"
 * (§ show delivery before the last step).
 *
 * Cached across requests, for the same reason `getCurrentBusiness` is:
 * the marketing layout is `force-dynamic` because *stock* has to be
 * live, and this rode along on that. It is not stock. It is a rate
 * card — the zone fees an operator sets once and revisits when courier
 * pricing changes — so every checkout render was paying a Firestore
 * round trip for a number that changes a few times a year.
 *
 * Read from `deliveryZoneRules`, the same collection the real charge
 * is priced from, never from `FARGO_SEED_FEES_KES` — that constant
 * documents itself as seed data and is not the figure charged. The
 * amount actually taken is still computed per order at quote time
 * against live rules; this is only the "from" price on the box step,
 * so a few minutes of staleness costs nothing and cannot mis-charge
 * anyone.
 *
 * Failing soft to `null` hides the line rather than risking a wrong
 * price, and the `catch` sits inside the cached function so a failed
 * read is not what gets cached for the next five minutes.
 */
const CACHE_TTL_SECONDS = 300;

/**
 * The cheapest real fee among a set of zone rules, or `null`.
 *
 * `feeKes` is nullable on purpose — a zone with no rate card entered
 * yet has no fee, and this codebase refuses to invent one. Those zones
 * simply do not participate in the minimum, and a business with no
 * priced zone at all has no floor to quote rather than a floor of
 * zero, which would read as free delivery.
 *
 * Separated from the fetching so it can be tested as what it is: a
 * rule about which numbers count.
 */
export function cheapestFeeKes(
  rules: { data: { feeKes?: number | null } }[],
): number | null {
  const fees = rules
    .map(({ data }) => data.feeKes)
    .filter((fee): fee is number => typeof fee === 'number' && fee > 0);
  return fees.length > 0 ? Math.min(...fees) : null;
}

const loadFloor = unstable_cache(
  async (businessId: string): Promise<number | null> =>
    cheapestFeeKes(await deliveryZoneRuleRepository.listByBusiness(businessId)),
  ['checkout-delivery-floor'],
  { revalidate: CACHE_TTL_SECONDS, tags: ['delivery-zone-rules'] },
);

/** Per-request as well, so two components asking cannot become two reads. */
export const getDeliveryFloorKes = cache(
  async (businessId: string): Promise<number | null> => {
    try {
      return await loadFloor(businessId);
    } catch {
      return null;
    }
  },
);
