import { withPermission } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { machineIntegrationService } from '@/services/machineIntegrationService';

/** TEST — runs the adapter's own connection test. A pass moves "configured" → "tested". Never dispenses anything. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withPermission(request, 'integrations.machines.activate', async (session) => {
    const result = await machineIntegrationService.testConnection(session.businessId, id, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'test_machine_integration', entityType: 'machineIntegration', entityId: id, after: result, machineId: id });
    return Response.json(result);
  });
}
