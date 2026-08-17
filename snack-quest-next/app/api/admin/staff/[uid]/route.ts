import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import {
  staffManagementService,
  StaffValidationError,
  StaffNotFoundError,
  CannotModifySelfError,
  LastSuperAdminError,
} from '@/services/staffManagementService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { StaffRole } from '@/types';

interface PatchStaffBody {
  role?: unknown;
  disabled?: unknown;
  permissions?: unknown;
}

function errorResponse(error: unknown): Response {
  if (
    error instanceof StaffValidationError ||
    error instanceof CannotModifySelfError ||
    error instanceof LastSuperAdminError
  ) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof StaffNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  return Response.json({ error: error instanceof Error ? error.message : 'Could not update staff member' }, { status: 400 });
}

/** Changes role and/or disables/reactivates a staff account (§ Staff Management). One or the other per call, never both silently combined into one audit action. */
export async function PATCH(
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

  let body: PatchStaffBody;
  try {
    body = (await request.json()) as PatchStaffBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (body.role === undefined && body.disabled === undefined && body.permissions === undefined) {
    return Response.json({ error: 'Provide "role", "disabled", and/or "permissions".' }, { status: 400 });
  }

  try {
    if (body.role !== undefined) {
      if (typeof body.role !== 'string') {
        return Response.json({ error: '"role" must be a string.' }, { status: 400 });
      }
      await staffManagementService.changeRole(session.businessId, uid, body.role as StaffRole, session.uid);
      await recordAuditLog(request, {
        businessId: session.businessId,
        actorId: session.uid,
        action: 'staff.change_role',
        entityType: 'staffProfile',
        entityId: uid,
        after: { role: body.role },
      });
    }
    if (body.disabled !== undefined) {
      if (typeof body.disabled !== 'boolean') {
        return Response.json({ error: '"disabled" must be a boolean.' }, { status: 400 });
      }
      await staffManagementService.setDisabled(session.businessId, uid, body.disabled, session.uid);
      await recordAuditLog(request, {
        businessId: session.businessId,
        actorId: session.uid,
        action: body.disabled ? 'staff.disable' : 'staff.reactivate',
        entityType: 'staffProfile',
        entityId: uid,
        after: { disabled: body.disabled },
      });
    }
    if (body.permissions !== undefined) {
      if (!Array.isArray(body.permissions) || body.permissions.some((p) => typeof p !== 'string')) {
        return Response.json({ error: '"permissions" must be an array of strings.' }, { status: 400 });
      }
      const permissions = body.permissions as string[];
      await staffManagementService.changePermissions(session.businessId, uid, permissions, session.uid);
      await recordAuditLog(request, {
        businessId: session.businessId,
        actorId: session.uid,
        action: 'staff.change_permissions',
        entityType: 'staffProfile',
        entityId: uid,
        after: { permissions },
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Soft-deletes a staff account and disables its Auth login (§ Staff Management). */
export async function DELETE(
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
    await staffManagementService.removeStaff(session.businessId, uid, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'staff.remove',
      entityType: 'staffProfile',
      entityId: uid,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
