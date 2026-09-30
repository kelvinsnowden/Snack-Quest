import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasAnyPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { KioskReportValidationError, kioskRuntimeService } from '@/services/kioskRuntimeService';

/**
 * One-time service codes for a machine's screen (§ KIOSK SERVICE MODE).
 * POST issues one (`machines.service_codes.issue`, audited with the
 * reason); the code is in this response only. GET lists recent codes —
 * never the codes themselves.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasAnyPermission(session, ['machines.service_codes.issue', 'machines.view'])) return forbiddenForPermission('machines.view');
  const { id } = await params;
  const codes = await kioskRuntimeService.listServiceCodes(session.businessId, id);
  return Response.json({
    codes: codes.map(({ id: codeId, data }) => ({
      id: codeId,
      status: data.status,
      reason: data.reason,
      issuedBy: data.issuedBy,
      issuedAt: data.issuedAt ? (data.issuedAt as unknown as { toDate(): Date }).toDate().toISOString() : null,
      expiresAt: (data.expiresAt as unknown as { toDate(): Date }).toDate().toISOString(),
      usedAt: data.usedAt ? (data.usedAt as unknown as { toDate(): Date }).toDate().toISOString() : null,
    })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.service_codes.issue')) return forbiddenForPermission('machines.service_codes.issue');
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  try {
    const issued = await kioskRuntimeService.issueServiceCode(session.businessId, id, typeof body.reason === 'string' ? body.reason : '', session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'machine.issue_service_code', entityType: 'machine', entityId: id, after: { codeId: issued.id, reason: body.reason, expiresAt: issued.expiresAt.toISOString() }, machineId: id });
    return Response.json({ code: issued.code, expiresAt: issued.expiresAt.toISOString() }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof MachineNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof KioskReportValidationError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
