import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission, effectivePermissionsOf } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import {
  staffManagementService,
  StaffValidationError,
  StaffNotFoundError,
  CannotModifySelfError,
  PermissionEscalationError,
} from '@/services/staffManagementService';

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * Sets what a staff member may do: `{ template, granted, revoked }` —
 * a role template (or null for their role's default) plus permissions
 * added or taken away one by one. Takes effect on their next request.
 * Audited with the full before and after, so "who gave them that?" is
 * always answerable.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ uid: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'users.manage')) {
    return forbiddenForPermission('users.manage');
  }
  const { uid } = await params;

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { template, granted, revoked } = body;
  if (template !== null && typeof template !== 'string') {
    return Response.json({ error: '"template" must be a template name or null.' }, { status: 400 });
  }
  if (!isStringArray(granted) || !isStringArray(revoked)) {
    return Response.json({ error: '"granted" and "revoked" must be lists of permission names.' }, { status: 400 });
  }

  try {
    const result = await staffManagementService.setAccess(
      session.businessId,
      uid,
      { template, granted, revoked },
      { uid: session.uid, permissions: effectivePermissionsOf(session) },
    );
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'staff.change_access',
      entityType: 'staffProfile',
      entityId: uid,
      before: { permissions: result.before },
      after: { ...result.stored, permissions: result.after },
    });
    return Response.json({ permissions: result.after, ...result.stored });
  } catch (error) {
    if (error instanceof StaffNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof PermissionEscalationError) {
      return Response.json({ error: error.message, permissions: error.permissions }, { status: 403 });
    }
    if (error instanceof StaffValidationError || error instanceof CannotModifySelfError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
