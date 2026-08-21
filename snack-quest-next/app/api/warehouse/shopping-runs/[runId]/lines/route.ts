import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  shoppingRunService,
  ShoppingRunValidationError,
  ShoppingRunNotFoundError,
} from '@/services/shoppingRunService';

/**
 * Records what was actually bought for one snack on a run.
 *
 * Deliberately not audit-logged. This fires every time someone ticks a
 * checkbox or types a price at a till — dozens of writes per trip — and
 * filling the audit log with them would bury the entries that matter.
 * The run document itself already carries who last touched it and what
 * every line says, which is the real record.
 */
function canUseWarehouse(roles: string[]): boolean {
  return roles.some((role) => role === 'warehouse' || role === 'admin' || role === 'super_admin');
}

export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }): Promise<Response> {
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

  const { snackItemId, purchased, actualUnitCostKes, actualQuantity, note } = (body ?? {}) as Record<string, unknown>;
  if (typeof snackItemId !== 'string' || !snackItemId) {
    return Response.json({ error: 'snackItemId is required' }, { status: 400 });
  }

  const { runId } = await params;
  try {
    const run = await shoppingRunService.recordLine(
      session.businessId,
      runId,
      {
        snackItemId,
        ...(purchased === undefined ? {} : { purchased: Boolean(purchased) }),
        ...(actualUnitCostKes === undefined ? {} : { actualUnitCostKes: actualUnitCostKes as number | null }),
        ...(actualQuantity === undefined ? {} : { actualQuantity: actualQuantity as number | null }),
        ...(note === undefined ? {} : { note: note as string | null }),
      },
      session.uid,
    );

    return Response.json({ actualTotalKes: run.actualTotalKes, lines: run.lines });
  } catch (error) {
    if (error instanceof ShoppingRunNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ShoppingRunValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
