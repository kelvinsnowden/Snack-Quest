import { readJsonObject, requiredString, withPermission } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withPermission(request, 'integrations.certify', async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const reason = requiredString(body, 'reason');
    await manufacturerRegistryService.revokeCertification(session.businessId, id, reason, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'revoke_model_certification', entityType: 'machineModel', entityId: id, after: { reason } });
    return Response.json({ ok: true });
  });
}
