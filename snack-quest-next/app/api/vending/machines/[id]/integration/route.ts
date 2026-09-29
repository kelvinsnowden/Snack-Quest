import { optionalString, readJsonObject, requiredString, withPermission } from '@/lib/vending/adminIntegrationRoute';
import { toJsonSafe } from '@/lib/vending/serializeIntegration';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import type { MachineIntegrationEnvironment } from '@/types';

/** The machine's Integration card: manufacturer, model, adapter, lifecycle state, health, capability matrix and anything blocking activation. Admin console only — never part of an owner response. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withPermission(request, 'integrations.view', async (session) =>
    Response.json(toJsonSafe(await machineIntegrationService.getView(session.businessId, id))),
  );
}

/** CONFIGURE — (re)writes the integration and drops it to "configured"; testing and activation must follow. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withPermission(request, 'integrations.machines.configure', async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const input = {
      machineId: id,
      manufacturerId: requiredString(body, 'manufacturerId'),
      modelId: requiredString(body, 'modelId'),
      manufacturerMachineId: requiredString(body, 'manufacturerMachineId'),
      adapterKey: optionalString(body, 'adapterKey'),
      controllerType: optionalString(body, 'controllerType'),
      controllerVersion: optionalString(body, 'controllerVersion'),
      firmwareVersion: optionalString(body, 'firmwareVersion'),
      integrationVersion: optionalString(body, 'integrationVersion'),
      environment: requiredString(body, 'environment') as MachineIntegrationEnvironment,
    };
    await machineIntegrationService.configure(session.businessId, input, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'configure_machine_integration', entityType: 'machineIntegration', entityId: id, after: input, machineId: id });
    return Response.json(toJsonSafe(await machineIntegrationService.getView(session.businessId, id)));
  });
}
