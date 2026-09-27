import { ADMIN_ONLY } from '@/lib/auth/requireStaffRole';
import { withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { machineIntegrationService } from '@/services/machineIntegrationService';

/** ACTIVATE — refused with 409 and the list of blockers unless every gate passes (recent passing test, certified model, production stage, no sandbox on production). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withStaffRoles(request, ADMIN_ONLY, async (session) => {
    await machineIntegrationService.activate(session.businessId, id, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'activate_machine_integration', entityType: 'machineIntegration', entityId: id, machineId: id });
    return Response.json({ ok: true, state: 'active' });
  });
}
