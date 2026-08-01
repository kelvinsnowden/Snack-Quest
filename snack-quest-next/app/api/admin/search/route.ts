import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { globalSearchService } from '@/services/globalSearchService';

/** Global search across Orders, Customers, Products, Inventory, Suppliers, Purchase orders, Conversations, and Creators (§ Phase 7). */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';

  const response = await globalSearchService.search(session.businessId, query);
  return Response.json(response);
}
