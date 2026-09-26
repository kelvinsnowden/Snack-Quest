import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { alertService, AlertNotFoundError, AlertNotOpenError } from '@/services/alertService';
import { serializeAlert } from '@/lib/vending/serialize';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** Claims an open alert as being looked at — sets `assignee`, moves `open` → `acknowledged`. Never resolves it; see the sibling `resolve` route for that. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id } = await params;
  try {
    const alert = await alertService.acknowledge(session.businessId, id, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'acknowledge_alert',
      entityType: 'alert',
      entityId: id,
      before: { status: 'open' },
      after: { status: 'acknowledged', assignee: session.uid },
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
    throw error;
  }
}
