import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import {
  restockTaskService,
  RestockTaskNotFoundError,
  IllegalRestockTaskTransitionError,
  RestockTaskItemMismatchError,
  RestockTaskItemIncompleteError,
  RestockTaskQuantityError,
  SlotNotFoundError,
} from '@/services/restockTaskService';

/**
 * `in_transit → received | partially_received` — the one call that
 * actually adds stock (§ RESTOCKING: "completing must create real
 * ledger movements"). Which terminal state results is derived from
 * what was actually received versus what was dispatched, never chosen
 * by the caller.
 */
export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { taskId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { items, discrepancyNote } = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: 'items must be a non-empty array' }, { status: 400 });
  }
  for (const item of items as Record<string, unknown>[]) {
    if (typeof item.slotId !== 'string' || typeof item.quantityReceived !== 'number') {
      return Response.json({ error: 'each item needs a slotId (string) and quantityReceived (number)' }, { status: 400 });
    }
  }
  if (discrepancyNote !== undefined && discrepancyNote !== null && typeof discrepancyNote !== 'string') {
    return Response.json({ error: 'discrepancyNote must be a string when provided' }, { status: 400 });
  }

  try {
    const { status } = await restockTaskService.receive(
      session.businessId,
      taskId,
      session.uid,
      items as { slotId: string; quantityReceived: number }[],
      discrepancyNote as string | null | undefined,
    );
    return Response.json({ status });
  } catch (error) {
    if (error instanceof RestockTaskNotFoundError || error instanceof RestockTaskItemMismatchError || error instanceof SlotNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof IllegalRestockTaskTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof RestockTaskItemIncompleteError || error instanceof RestockTaskQuantityError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
