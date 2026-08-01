import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/requireSuperAdmin';
import {
  staffManagementService,
  StaffValidationError,
  StaffAlreadyExistsError,
} from '@/services/staffManagementService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import type { StaffRole } from '@/types';

interface InviteStaffBody {
  email?: unknown;
  displayName?: unknown;
  role?: unknown;
  department?: unknown;
}

/** Lists every staff account on this business (§ Staff Management). */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
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
  if (!isSuperAdmin(session)) {
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

  try {
    const result = await staffManagementService.inviteStaff(
      session.businessId,
      { email: body.email, displayName: body.displayName, role: body.role as StaffRole, department: body.department },
      session.uid,
    );

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'staff.invite',
      entityType: 'staffProfile',
      entityId: result.uid,
      after: { email: body.email, role: body.role, department: body.department, emailAttempted: result.emailAttempted },
    });

    return Response.json({ uid: result.uid, resetLink: result.resetLink, emailAttempted: result.emailAttempted }, { status: 201 });
  } catch (error) {
    if (error instanceof StaffValidationError || error instanceof StaffAlreadyExistsError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : 'Could not invite staff member' }, { status: 400 });
  }
}
