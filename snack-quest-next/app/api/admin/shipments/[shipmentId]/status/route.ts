import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { deliveryService, ShipmentNotFoundError, InvalidShipmentTransitionError } from '@/services/deliveryService';
import type { ShipmentStatus } from '@/types';

const VALID_STATUSES: ShipmentStatus[] = ['pending', 'pending_manual_booking', 'created', 'in_transit', 'delivered', 'failed'];

/** A manual shipment status override (§ Admin: Delivery monitoring), enforcing `VALID_SHIPMENT_TRANSITIONS` server-side. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ shipmentId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { shipmentId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { status } = (body ?? {}) as { status?: unknown };
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as ShipmentStatus)) {
    return Response.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  try {
    await deliveryService.updateShipmentStatus(session.businessId, shipmentId, status as ShipmentStatus, session.uid);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ShipmentNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidShipmentTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not update shipment' },
      { status: 400 },
    );
  }
}
