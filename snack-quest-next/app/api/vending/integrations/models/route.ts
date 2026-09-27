import { ADMIN_ONLY } from '@/lib/auth/requireStaffRole';
import { optionalString, readJsonObject, requiredString, withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { manufacturerRegistryService } from '@/services/manufacturerRegistryService';

/** Registers a machine model under a manufacturer, with the capabilities its hardware physically has. */
export async function POST(request: Request): Promise<Response> {
  return withStaffRoles(request, ADMIN_ONLY, async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const input = {
      manufacturerId: requiredString(body, 'manufacturerId'),
      name: requiredString(body, 'name'),
      slug: requiredString(body, 'slug'),
      adapterKey: optionalString(body, 'adapterKey'),
      declaredCapabilities: body.declaredCapabilities,
      slotCount: typeof body.slotCount === 'number' ? body.slotCount : null,
      slotIdFormat: optionalString(body, 'slotIdFormat'),
      notes: optionalString(body, 'notes'),
    };
    const id = await manufacturerRegistryService.createModel(session.businessId, input, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'create_machine_model', entityType: 'machineModel', entityId: id, after: input });
    return Response.json({ id }, { status: 201 });
  });
}
