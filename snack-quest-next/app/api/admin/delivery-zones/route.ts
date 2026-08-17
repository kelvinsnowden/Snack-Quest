import {
  hasStaffRole,
  ADMIN_ONLY,
  forbiddenResponse,
} from '@/lib/auth/requireStaffRole';
import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import {
  deliveryZoneService,
  DeliveryZoneValidationError,
} from '@/services/deliveryZoneService';

interface SetZoneFeeBody {
  zone?: unknown;
  shippingOrigin?: unknown;
  packageCategory?: unknown;
  courier?: unknown;
  feeKes?: unknown;
}

/** Lists every pickup-delivery zone with its current fee and affected station count (§ Fix pickup delivery fee revenue leak). */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  const result = await deliveryZoneService.listZones(session.businessId);
  return Response.json(result);
}

/** Sets a zone's fee and fans it out to every matching pickup station. */
export async function PATCH(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_ONLY)) {
    return forbiddenResponse();
  }

  let body: SetZoneFeeBody;
  try {
    body = (await request.json()) as SetZoneFeeBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (
    typeof body.zone !== 'string' ||
    typeof body.shippingOrigin !== 'string' ||
    typeof body.packageCategory !== 'string' ||
    typeof body.courier !== 'string' ||
    typeof body.feeKes !== 'number'
  ) {
    return Response.json(
      {
        error:
          '"zone", "shippingOrigin", "packageCategory", "courier" (strings) and "feeKes" (number) are required.',
      },
      { status: 400 },
    );
  }

  const key = {
    zone: body.zone,
    shippingOrigin: body.shippingOrigin,
    packageCategory: body.packageCategory,
    courier: body.courier,
  };

  try {
    const { stationsUpdated } = await deliveryZoneService.setZoneFee(
      session.businessId,
      key,
      body.feeKes,
      session.uid,
    );

    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'deliveryZone.setFee',
      entityType: 'deliveryZoneRule',
      entityId: `${key.zone}:${key.shippingOrigin}:${key.packageCategory}:${key.courier}`,
      after: { feeKes: body.feeKes, stationsUpdated },
    });

    return Response.json({ stationsUpdated });
  } catch (error) {
    if (error instanceof DeliveryZoneValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not update this zone.',
      },
      { status: 400 },
    );
  }
}
