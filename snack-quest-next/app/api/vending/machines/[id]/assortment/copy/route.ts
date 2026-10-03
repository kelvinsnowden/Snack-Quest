import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { machineAssortmentService, MerchandisingValidationError, ProductNotFoundError } from '@/services/machineAssortmentService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/** "Copy range from…" (`machine_catalog.manage`; copying price overrides also needs `pricing.manage`). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machine_catalog.manage')) return forbiddenForPermission('machine_catalog.manage');
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (typeof body.fromMachineId !== 'string' || !body.fromMachineId) return Response.json({ error: 'fromMachineId is required' }, { status: 400 });
  const includePriceOverrides = body.includePriceOverrides === true;
  if (includePriceOverrides && !hasPermission(session, 'pricing.manage')) return forbiddenForPermission('pricing.manage');

  try {
    const result = await machineAssortmentService.copyRange(session.businessId, body.fromMachineId, id, { includePriceOverrides, actor: session.uid });
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'copy_machine_range',
      entityType: 'machine',
      entityId: id,
      after: { fromMachineId: body.fromMachineId, includePriceOverrides, ...result },
      machineId: id,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof MachineNotFoundError || error instanceof ProductNotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof MerchandisingValidationError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
