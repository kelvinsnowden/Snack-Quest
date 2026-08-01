import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import { staffManagementService, StaffNotFoundError } from '@/services/staffManagementService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** Generates a fresh password-reset link for a staff account (§ Staff Management). Never logs the link itself. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ uid: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { uid } = await params;

  try {
    const { resetLink } = await staffManagementService.resetPassword(session.businessId, uid);

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'staff.reset_password',
      entityType: 'staffProfile',
      entityId: uid,
    });

    return Response.json({ resetLink });
  } catch (error) {
    if (error instanceof StaffNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'Could not generate a reset link' }, { status: 400 });
  }
}
