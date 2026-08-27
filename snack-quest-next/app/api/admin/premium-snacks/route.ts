import { hasStaffRole, ADMIN_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { snackItemRepository } from '@/repositories/snackItemRepository';

/**
 * `GET /api/admin/premium-snacks` (§ staff pick the snacks too) — the
 * snacks a staff member can put in a box while taking an order on
 * someone's behalf.
 *
 * A wider list than the public route's, not the same one. That route
 * answers "what may a stranger choose from on the website", which an
 * admin controls with the per-snack "Customers can pick this in a
 * Premium box" opt-in. This one answers "what does the shop have",
 * because a customer on the phone naming a packet is not browsing an
 * offer (§ staff are not picking, they are packing).
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
 * Reachable by the Warehouse workspace as well as Admin. It began as
 * the list behind "take an order", which is an admin job — but the
 * same picker now completes a box on the packing queue (§ staff
 * complete the box), and a packer who cannot read the catalogue gets
 * an empty list and no way to record what they put in.
 *
 * Never cached: staff are reading this while stock moves, and a stale
 * count is worse than a slow one.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const snacks = await snackItemRepository.listForStaffPacking(session.businessId);

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
