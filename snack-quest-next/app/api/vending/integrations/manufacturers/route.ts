import { optionalString, readJsonObject, requiredString, withPermission } from '@/lib/vending/adminIntegrationRoute';
import { listAdapterRegistrations } from '@/lib/vending/adapterRegistry';
import { toJsonSafe } from '@/lib/vending/serializeIntegration';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { manufacturerRegistryService, RegistryValidationError } from '@/services/manufacturerRegistryService';
import { INTEGRATION_TYPES, type IntegrationType } from '@/types';

/** The registry at a glance — every manufacturer, every model, and every adapter the codebase can speak through. */
export async function GET(request: Request): Promise<Response> {
  return withPermission(request, 'integrations.view', async (session) => {
    const [manufacturers, models] = await Promise.all([
      manufacturerRegistryService.listManufacturers(session.businessId),
      manufacturerRegistryService.listModels(session.businessId),
    ]);
    return Response.json(
      toJsonSafe({
        manufacturers: manufacturers.map(({ id, data }) => ({ id, ...data, models: models.filter((model) => model.data.manufacturerId === id).map((model) => ({ id: model.id, ...model.data })) })),
        adapters: listAdapterRegistrations().map(({ key, label, direction, integrationTypes, environment, maturity, notes }) => ({ key, label, direction, integrationTypes, environment, maturity, notes })),
        integrationTypes: INTEGRATION_TYPES,
      }),
    );
  });
}

export async function POST(request: Request): Promise<Response> {
  return withPermission(request, 'integrations.manufacturers.manage', async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const integrationType = requiredString(body, 'integrationType');
    if (!INTEGRATION_TYPES.includes(integrationType as IntegrationType)) {
      throw new RegistryValidationError(`integrationType must be one of: ${INTEGRATION_TYPES.join(', ')}`);
    }
    const input = {
      name: requiredString(body, 'name'),
      slug: requiredString(body, 'slug'),
      integrationType: integrationType as IntegrationType,
      defaultAdapterKey: requiredString(body, 'defaultAdapterKey'),
      apiVersion: optionalString(body, 'apiVersion'),
      documentationUrl: optionalString(body, 'documentationUrl'),
      supportContact: optionalString(body, 'supportContact'),
      notes: optionalString(body, 'notes'),
    };
    const id = await manufacturerRegistryService.createManufacturer(session.businessId, input, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'create_manufacturer', entityType: 'manufacturer', entityId: id, after: input });
    return Response.json({ id }, { status: 201 });
  });
}
