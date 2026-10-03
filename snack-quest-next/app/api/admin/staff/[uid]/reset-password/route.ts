import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { staffManagementService, StaffNotFoundError, PermissionEscalationError, SuperAdminOnlyError } from '@/services/staffManagementService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { effectivePermissionsOf, hasPermission } from '@/lib/auth/permissions';

/** Generates a fresh password-reset link for a staff account (§ Staff Management). Never logs the link itself. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ uid: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'users.manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const { uid } = await params;

  try {
    const { resetLink } = await staffManagementService.resetPassword(session.businessId, uid, { uid: session.uid, roles: session.roles, permissions: effectivePermissionsOf(session) });

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'staff.reset_password',
      entityType: 'staffProfile',
      entityId: uid,
    });

    return Response.json({ resetLink });
  } catch (error) {
    if (error instanceof SuperAdminOnlyError || error instanceof PermissionEscalationError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof StaffNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'Could not generate a reset link' }, { status: 400 });
  }
}
