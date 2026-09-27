import { ADMIN_OR_WAREHOUSE } from '@/lib/auth/requireStaffRole';
import { optionalString, readJsonObject, withStaffRoles } from '@/lib/vending/adminIntegrationRoute';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { RegistryValidationError } from '@/services/manufacturerRegistryService';

const MAX_MAINTENANCE_HOURS = 72;

/**
 * Planned downtime: `{ hours, reason }` starts a maintenance window
 * (orders refused, offline alerts suppressed, liveness OFFLINE/planned);
 * `{ hours: 0 }` ends it. Warehouse staff can set it — they're the ones
 * standing at the machine with the door open.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return withStaffRoles(request, ADMIN_OR_WAREHOUSE, async (session) => {
    const body = await readJsonObject(request);
    if (body instanceof Response) {
      return body;
    }
    const hours = typeof body.hours === 'number' ? body.hours : NaN;
    if (!Number.isFinite(hours) || hours < 0 || hours > MAX_MAINTENANCE_HOURS) {
      throw new RegistryValidationError(`hours must be between 0 and ${MAX_MAINTENANCE_HOURS}`);
    }
    const reason = optionalString(body, 'reason');
    const until = hours === 0 ? null : new Date(Date.now() + hours * 3_600_000);
    await machineIntegrationRepository.setMaintenance(session.businessId, id, until, until ? reason ?? 'maintenance' : null, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: until ? 'start_machine_maintenance' : 'end_machine_maintenance',
      entityType: 'machineIntegration',
      entityId: id,
      after: { maintenanceUntil: until?.toISOString() ?? null, reason },
    });
    return Response.json({ maintenanceUntil: until?.toISOString() ?? null });
  });
}
