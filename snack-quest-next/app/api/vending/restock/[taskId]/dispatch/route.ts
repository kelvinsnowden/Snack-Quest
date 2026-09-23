import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import {
  restockTaskService,
  RestockTaskNotFoundError,
  IllegalRestockTaskTransitionError,
  RestockTaskItemMismatchError,
  RestockTaskItemIncompleteError,
  RestockTaskQuantityError,
} from '@/services/restockTaskService';

interface DispatchItemBody {
  slotId: string;
  quantityDispatched: number;
  batchId?: string | null;
  expiresAt?: string | null;
}

/**
 * `picking → dispatched`. The dispatcher states what's actually being
 * sent for every item on the task — never assumed to equal
 * `quantityNeeded`.
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
  const { items } = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: 'items must be a non-empty array' }, { status: 400 });
  }
  for (const item of items as Record<string, unknown>[]) {
    if (typeof item.slotId !== 'string' || typeof item.quantityDispatched !== 'number') {
      return Response.json({ error: 'each item needs a slotId (string) and quantityDispatched (number)' }, { status: 400 });
    }
    if (item.expiresAt !== undefined && item.expiresAt !== null && typeof item.expiresAt !== 'string') {
      return Response.json({ error: 'expiresAt must be an ISO date string when provided' }, { status: 400 });
    }
  }

  try {
    await restockTaskService.dispatch(
      session.businessId,
      taskId,
      session.uid,
      (items as DispatchItemBody[]).map((item) => ({
        slotId: item.slotId,
        quantityDispatched: item.quantityDispatched,
        batchId: item.batchId ?? null,
        expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
      })),
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RestockTaskNotFoundError || error instanceof RestockTaskItemMismatchError) {
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
