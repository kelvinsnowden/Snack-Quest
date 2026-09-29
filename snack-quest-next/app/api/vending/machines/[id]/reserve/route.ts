import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { machineInventoryReserveService } from '@/services/machineInventoryReserveService';
import { MachineNotFoundError } from '@/repositories/machineRepository';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';

/** The KSh 100,000 machine stock baseline (§ KSh 100,000 MACHINE STOCK BASELINE) — cost/retail/target/variance/replenishment, computed live from `MachineSlot`. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'machines.view')) {
    return forbiddenForPermission('machines.view');
  }

  const { id } = await params;
  try {
    const status = await machineInventoryReserveService.getReserveStatus(session.businessId, id);
    return Response.json(status);
  } catch (error) {
    if (error instanceof MachineNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
