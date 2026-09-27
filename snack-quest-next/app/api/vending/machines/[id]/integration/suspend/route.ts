import { ADMIN_ONLY } from '@/lib/auth/requireStaffRole';
import { readJsonObject, requiredString, withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { machineIntegrationService } from '@/services/machineIntegrationService';

/** Suspends dispensing on this machine immediately; reporting continues. Re-activation re-runs every gate. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withStaffRoles(request, ADMIN_ONLY, async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const reason = requiredString(body, 'reason');
    await machineIntegrationService.suspend(session.businessId, id, reason, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'suspend_machine_integration', entityType: 'machineIntegration', entityId: id, after: { reason }, machineId: id });
    return Response.json({ ok: true, state: 'suspended' });
  });
}
