import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { alertService, AlertNotFoundError, AlertNotOpenError, ResolutionRequiredError } from '@/services/alertService';
import { serializeAlert } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * Resolves an open/acknowledged alert with a required note (§ PART 6
 * — ALERT CENTER: every alert carries a "resolution"). For a
 * condition alert this is a human closing the book on something the
 * next sweep may reopen if it's still true; for an event alert
 * (`machine_fault`/`inventory_discrepancy`) it is the only way it
 * ever closes at all — see `types/alert.ts`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { resolution } = (body ?? {}) as Record<string, unknown>;
  if (typeof resolution !== 'string' || !resolution.trim()) {
    return Response.json({ error: 'resolution is required' }, { status: 400 });
  }

  const { id } = await params;
  try {
    const alert = await alertService.resolve(session.businessId, id, session.uid, resolution);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'resolve_alert',
      entityType: 'alert',
      entityId: id,
      before: null,
      after: { status: 'resolved', resolution, resolvedBy: session.uid },
      machineId: alert.machineId,
    });
    return Response.json({ alert: serializeAlert(id, alert) });
  } catch (error) {
    if (error instanceof AlertNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof AlertNotOpenError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ResolutionRequiredError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
