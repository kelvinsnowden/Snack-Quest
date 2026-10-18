import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { ManufacturerMachineIdInUseError, machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { IntegrationConfigurationError } from '@/services/machineIntegrationService';
import { MachineReplacementError, machineReplacementService } from '@/services/machineReplacementService';

/**
 * `POST /api/vending/machines/{id}/replace` `{ serialNumber, model?, hardwareVersion?, firmwareVersion?, manufacturerMachineId?, reason }`
 * — new hardware, same machine. Needs `machines.create` (it is
 * registering a physical unit) and, for an integrated machine,
 * `integrations.machines.configure` (it re-points the integration).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.create')) return forbiddenForPermission('machines.create');
  const { id } = await params;
  if ((await machineIntegrationRepository.findByMachineId(session.businessId, id)) && !hasPermission(session, 'integrations.machines.configure')) {
    return forbiddenForPermission('integrations.machines.configure');
  }
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string) : null);
  try {
    const result = await machineReplacementService.replace(
      session.businessId,
      id,
      { serialNumber: text('serialNumber') ?? '', model: text('model'), hardwareVersion: text('hardwareVersion'), firmwareVersion: text('firmwareVersion'), manufacturerMachineId: text('manufacturerMachineId'), reason: text('reason') ?? '' },
      session.uid,
    );
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'replace_machine_hardware',
      entityType: 'machine',
      entityId: id,
      machineId: id,
      after: { serialNumber: text('serialNumber'), manufacturerMachineId: text('manufacturerMachineId'), reason: text('reason'), revokedKeys: result.revokedKeys },
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof MachineReplacementError || error instanceof IntegrationConfigurationError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof ManufacturerMachineIdInUseError) return Response.json({ error: 'That unit id is already registered to another machine.' }, { status: 409 });
    if (error instanceof MachineNotFoundError) return Response.json({ error: 'Machine not found.' }, { status: 404 });
    throw error;
  }
}
