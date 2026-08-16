import {
  hasStaffRole,
  ADMIN_OR_WAREHOUSE,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  orderService,
  OrderNotFoundError,
  InvalidOrderTransitionError,
} from '@/services/orderService';
import type { OrderStatus } from '@/types';

const VALID_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'dispatched',
  'delivered',
  'cancelled',
  'refund_requested',
];

/**
 * The wire for every Admin Orders status action — update/dispatch/
 * complete/cancel/refund-request are all the same call with a
 * different target status (§ Admin: Orders). Real staff-session auth
 * (not a shared secret) since this is the first admin mutation route
 * built on top of the Phase 2 auth foundation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { orderId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { status, reason } = (body ?? {}) as {
    status?: unknown;
    reason?: unknown;
  };
  if (
    typeof status !== 'string' ||
    !VALID_STATUSES.includes(status as OrderStatus)
  ) {
    return Response.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }
  if (reason !== undefined && typeof reason !== 'string') {
    return Response.json(
      { error: 'reason must be a string when provided' },
      { status: 400 },
    );
  }

  try {
    const order = await orderService.updateStatus(
      session.businessId,
      orderId,
      status as OrderStatus,
      session.uid,
      reason,
    );
    return Response.json({ order });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidOrderTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not update order',
      },
      { status: 400 },
    );
  }
}
