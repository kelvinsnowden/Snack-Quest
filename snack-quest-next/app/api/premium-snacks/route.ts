import { snackItemRepository } from '@/repositories/snackItemRepository';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';

/**
 * `GET /api/premium-snacks` (§ Premium: choose 5, discover the rest) —
 * the snacks a customer may choose as guaranteed picks.
 *
 * Deliberately not the whole catalogue. `snackItems` exists for buying
 * and packing, so it holds bulk staples and things being trialled that
 * no customer should be picking from; a snack appears here only once
 * an admin opts it in, and only while it is active and — if it is
 * counted at all — in stock.
 *
 * Returns just what a card needs. Cost price, sourcing note and unit
 * label are real fields on these rows and none of them are any of a
 * customer's business, so they are not serialised rather than being
 * sent and hidden in the UI.
 *
 * Short cache: this list changes when an admin toggles a snack or
 * stock runs out, and a customer holding a stale card is not a
 * problem — the server re-checks every pick at checkout and refuses
 * one that has since gone.
 */
const CACHE_HEADERS = {
  'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
};

export async function GET(): Promise<Response> {
  const businessId = getCurrentBusinessId();
  const snacks = await snackItemRepository.listSelectableForPremium(businessId);

  return Response.json(
    {
      snacks: snacks.map(({ id, data }) => ({
        id,
        name: data.name,
        origin: data.origin,
        imageUrl: data.imageUrl,
      })),
    },
    { headers: CACHE_HEADERS },
  );
}
