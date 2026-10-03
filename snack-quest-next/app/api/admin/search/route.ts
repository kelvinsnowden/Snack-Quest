import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { globalSearchService } from '@/services/globalSearchService';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** Global search (§ Phase 7): each kind of result only for people who can open its page. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'search.use')) {
    return forbiddenForPermission('search.use');
  }

  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';

  const response = await globalSearchService.search(session.businessId, query, (permission) => hasPermission(session, permission));
  return Response.json(response);
}
