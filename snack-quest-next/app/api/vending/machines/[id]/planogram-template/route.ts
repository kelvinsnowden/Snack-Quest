import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { forbiddenForPermission, hasPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { PlanogramError, planogramService } from '@/services/planogramService';

/** `POST` `{ name, suitsFor? }` — saves this machine's slot layout as a planogram template. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(session, 'machines.slots.configure')) return forbiddenForPermission('machines.slots.configure');
  const { id } = await params;
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    const templateId = await planogramService.saveFromMachine(session.businessId, id, { name: body.name, suitsFor: body.suitsFor }, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'create_planogram_template', entityType: 'planogramTemplate', entityId: templateId, machineId: id, after: { name: body.name } });
    return Response.json({ templateId }, { status: 201 });
  } catch (error) {
    if (error instanceof PlanogramError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof MachineNotFoundError) return Response.json({ error: 'Machine not found.' }, { status: 404 });
    throw error;
  }
}
