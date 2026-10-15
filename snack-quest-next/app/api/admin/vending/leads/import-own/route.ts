import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { vendingLeadService } from '@/services/vendingLeadService';

/**
 * `POST /api/admin/vending/leads/import-own` (§ vending leads CRM) —
 * copies `/own` applications made before the CRM existed into it. New
 * applications are copied as they arrive; this is for the backlog, and
 * is safe to press more than once.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'owners.manage')) {
    return forbiddenForPermission('owners.manage');
  }

  const result = await vendingLeadService.importOwnApplications();
  return Response.json(result);
}
