import { ADMIN_ONLY, ADMIN_OR_WAREHOUSE } from '@/lib/auth/requireStaffRole';
import { optionalString, readJsonObject, withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { toJsonSafe } from '@/lib/vending/serializeIntegration';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { manufacturerRegistryService, RegistryValidationError } from '@/services/manufacturerRegistryService';
import { integrationCredentialService } from '@/services/integrationCredentialService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { INTEGRATION_TYPES, type IntegrationType } from '@/types';

/** One manufacturer: its onboarding record, models (with certification checklists), credentials (never secrets) and connected machines with live health. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withStaffRoles(request, ADMIN_OR_WAREHOUSE, async (session) => {
    const manufacturer = await manufacturerRegistryService.requireManufacturer(session.businessId, id);
    const [models, credentials, integrations] = await Promise.all([
      manufacturerRegistryService.listModels(session.businessId, id),
      integrationCredentialService.listForManufacturer(session.businessId, id),
      machineIntegrationService.listIntegrations(session.businessId),
    ]);
    return Response.json(
      toJsonSafe({
        manufacturer: { id, ...manufacturer },
        models: models.map((model) => ({ id: model.id, ...model.data })),
        credentials,
        machines: integrations
          .filter(({ integration }) => integration.manufacturerId === id)
          .map(({ integration, health }) => ({
            machineId: integration.machineId,
            machineCode: integration.machineCode,
            modelId: integration.modelId,
            manufacturerMachineId: integration.manufacturerMachineId,
            environment: integration.environment,
            state: integration.state,
            health,
          })),
      }),
    );
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withStaffRoles(request, ADMIN_ONLY, async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const integrationType = optionalString(body, 'integrationType');
    if (integrationType && !INTEGRATION_TYPES.includes(integrationType as IntegrationType)) {
      throw new RegistryValidationError(`integrationType must be one of: ${INTEGRATION_TYPES.join(', ')}`);
    }
    const update = Object.fromEntries(
      Object.entries({
        name: optionalString(body, 'name') ?? undefined,
        integrationType: (integrationType ?? undefined) as IntegrationType | undefined,
        defaultAdapterKey: optionalString(body, 'defaultAdapterKey') ?? undefined,
        apiVersion: optionalString(body, 'apiVersion'),
        documentationUrl: optionalString(body, 'documentationUrl'),
        supportContact: optionalString(body, 'supportContact'),
        notes: optionalString(body, 'notes'),
      }).filter(([, value]) => value !== undefined),
    );
    const before = await manufacturerRegistryService.requireManufacturer(session.businessId, id);
    await manufacturerRegistryService.updateManufacturer(session.businessId, id, update, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'update_manufacturer', entityType: 'manufacturer', entityId: id, before: toJsonSafe(before) as Record<string, unknown>, after: update });
    return Response.json({ ok: true });
  });
}
