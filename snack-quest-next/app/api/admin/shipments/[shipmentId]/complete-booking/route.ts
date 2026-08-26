import {
  hasStaffRole,
  ADMIN_AGENT_OR_WAREHOUSE,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import {
  deliveryService,
  ShipmentNotFoundError,
  InvalidShipmentTransitionError,
} from '@/services/deliveryService';

/**
 * Records a manually-booked courier's reference (§ Admin: Delivery
 * monitoring — the manual-booking queue's action) and moves the
 * shipment to `created`.
 *
 * Reachable by the Warehouse workspace as well as the Agent one: its
 * own "Ready for courier" queue renders this same dialog, and until
 * now clicking it returned 403.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ shipmentId: string }> },
): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_AGENT_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { shipmentId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { courierShipmentRef, trackingUrl } = (body ?? {}) as {
    courierShipmentRef?: unknown;
    trackingUrl?: unknown;
  };
  if (
    typeof courierShipmentRef !== 'string' ||
    courierShipmentRef.trim().length === 0
  ) {
    return Response.json(
      { error: '"courierShipmentRef" is required.' },
      { status: 400 },
    );
  }
  if (
    trackingUrl !== undefined &&
    trackingUrl !== null &&
    typeof trackingUrl !== 'string'
  ) {
    return Response.json(
      { error: '"trackingUrl" must be a string or null when provided.' },
      { status: 400 },
    );
  }

  try {
    await deliveryService.completeManualBooking(
      session.businessId,
      shipmentId,
      {
        courierShipmentRef: courierShipmentRef.trim(),
        trackingUrl: (trackingUrl as string | null | undefined) ?? null,
      },
      session.uid,
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ShipmentNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidShipmentTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not complete manual booking',
      },
      { status: 400 },
    );
  }
}
