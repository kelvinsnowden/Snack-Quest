import { hasStaffRole, ADMIN_ONLY, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { snackItemRepository } from '@/repositories/snackItemRepository';

/**
 * `GET /api/admin/premium-snacks` (§ staff pick the snacks too) — the
 * same selectable snacks as the public route, for a staff member
 * taking an order on someone's behalf.
 *
 * A separate route rather than a flag on the public one, because the
 * two answer to different people. `/api/premium-snacks` deliberately
 * withholds anything that is none of a customer's business; stock
 * count is exactly that, and adding it there behind a query parameter
 * would put an authorisation decision inside a cached public endpoint.
 *
 * Stock is the whole reason this exists. A customer picking for
 * themselves only needs to know a snack is available — the list is
 * already filtered to what is. A staff member on a phone call needs to
 * know it is down to its last two, because they are about to promise
 * it to someone out loud and then pack it by hand.
 *
 * Never cached: staff are reading this while stock moves, and a stale
 * count is worse than a slow one.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const snacks = await snackItemRepository.listSelectableForPremium(session.businessId);

  return Response.json(
    {
      snacks: snacks.map(({ id, data }) => ({
        id,
        name: data.name,
        origin: data.origin,
        imageUrl: data.imageUrl,
        // `undefined` means untracked, which is not the same as zero
        // and must not be rendered as "0 left" — see
        // `isSelectableSnack`, which lets an uncounted snack through
        // for the same reason.
        stockCount: data.stockCount ?? null,
      })),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
