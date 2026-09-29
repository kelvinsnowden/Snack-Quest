import { optionalString, readJsonObject, withPermission } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';

/** Updates a model. Changing its capabilities or adapter after certification revokes the certification. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withPermission(request, 'integrations.models.manage', async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const update = {
      name: optionalString(body, 'name') ?? undefined,
      adapterKey: optionalString(body, 'adapterKey'),
      declaredCapabilities: body.declaredCapabilities,
      slotCount: body.slotCount === undefined ? undefined : typeof body.slotCount === 'number' ? body.slotCount : null,
      slotIdFormat: optionalString(body, 'slotIdFormat'),
      notes: optionalString(body, 'notes'),
    };
    const result = await manufacturerRegistryService.updateModel(session.businessId, id, update, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'update_machine_model', entityType: 'machineModel', entityId: id, after: { ...update, certificationRevoked: result.certificationRevoked } });
    return Response.json(result);
  });
}
