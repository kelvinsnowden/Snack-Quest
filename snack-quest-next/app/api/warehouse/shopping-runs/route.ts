import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { shoppingRunService, ShoppingRunValidationError } from '@/services/shoppingRunService';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';

/**
 * `/api/warehouse/shopping-runs` (§ Box Recipes).
 *
 * Gated to the same roles as the Warehouse workspace itself rather than
 * to admins: the people who create and work a shopping run are exactly
 * the warehouse staff this portal exists for, and requiring an admin
 * would mean a runner cannot start their own trip.
 */
function canUseWarehouse(roles: string[]): boolean {
  return roles.some((role) => role === 'warehouse' || role === 'admin' || role === 'super_admin');
}

export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!canUseWarehouse(session.roles)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { orderIds } = (body ?? {}) as { orderIds?: unknown };
  if (!Array.isArray(orderIds)) {
    return Response.json({ error: 'orderIds must be an array' }, { status: 400 });
  }

  try {
    const runId = await shoppingRunService.createRun(session.businessId, orderIds.map(String), session.uid);

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'shopping_run.create',
      entityType: 'shoppingRun',
      entityId: runId,
      before: null,
      after: { orderCount: orderIds.length },
    });

    return Response.json({ runId }, { status: 201 });
  } catch (error) {
    if (error instanceof ShoppingRunValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
