import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { partnerPortalAccessService, PortalAccessError } from '@/services/partnerPortalAccessService';

/**
 * Email an owner their Owner Portal login: a link to create their password
 * (`owners.manage`). Sets up their login if they have none. The link comes
 * back too, so staff can send it on WhatsApp if the email doesn't arrive.
 */
export async function POST(request: Request, { params }: { params: Promise<{ partnerId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'owners.manage')) return forbiddenForPermission('owners.manage');
  const { partnerId } = await params;
  try {
    const result = await partnerPortalAccessService.sendInvite(session.businessId, partnerId, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'send_owner_portal_login',
      entityType: 'partner',
      entityId: partnerId,
      after: { email: result.email, emailed: result.emailed },
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof PortalAccessError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
