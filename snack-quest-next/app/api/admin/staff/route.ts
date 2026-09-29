import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  staffManagementService,
  StaffValidationError,
  StaffAlreadyExistsError,
  PermissionEscalationError,
  SuperAdminOnlyError,
} from '@/services/staffManagementService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { StaffRole } from '@/types';
import { effectivePermissionsOf, hasPermission } from '@/lib/auth/permissions';

interface InviteStaffBody {
  email?: unknown;
  displayName?: unknown;
  role?: unknown;
  department?: unknown;
  template?: unknown;
  permissions?: unknown;
}

/** Lists every staff account on this business (§ Staff Management). */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'users.manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const staff = await staffManagementService.listStaff(session.businessId);
  return Response.json({ staff });
}

/** Invites a new staff member (§ Staff Management). Never logs the reset link — only that an invite happened. */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'users.manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: InviteStaffBody;
  try {
    body = (await request.json()) as InviteStaffBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (
    typeof body.email !== 'string' ||
    typeof body.displayName !== 'string' ||
    typeof body.role !== 'string' ||
    typeof body.department !== 'string'
  ) {
    return Response.json({ error: '"email", "displayName", "role", and "department" are required strings.' }, { status: 400 });
  }
  if (body.permissions !== undefined && (!Array.isArray(body.permissions) || body.permissions.some((p) => typeof p !== 'string'))) {
    return Response.json({ error: '"permissions" must be an array of strings.' }, { status: 400 });
  }
  const permissions = body.permissions as string[] | undefined;
  if (body.template !== undefined && body.template !== null && typeof body.template !== 'string') {
    return Response.json({ error: '"template" must be a template key or null.' }, { status: 400 });
  }
  const template = (body.template as string | null | undefined) ?? null;

  try {
    const result = await staffManagementService.inviteStaff(
      session.businessId,
      { email: body.email, displayName: body.displayName, role: body.role as StaffRole, department: body.department, permissions, template },
      { uid: session.uid, roles: session.roles, permissions: effectivePermissionsOf(session) },
    );

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'staff.invite',
      entityType: 'staffProfile',
      entityId: result.uid,
      after: { email: body.email, role: body.role, department: body.department, template, permissions: permissions ?? [], emailAttempted: result.emailAttempted },
    });

    return Response.json({ uid: result.uid, resetLink: result.resetLink, emailAttempted: result.emailAttempted }, { status: 201 });
  } catch (error) {
    if (error instanceof SuperAdminOnlyError || error instanceof PermissionEscalationError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof StaffValidationError || error instanceof StaffAlreadyExistsError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'Could not invite staff member' }, { status: 400 });
  }
}
