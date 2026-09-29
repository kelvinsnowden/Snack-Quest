import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { locationService, LocationNotFoundError } from '@/services/locationService';
import { serializeLocation } from '@/lib/vending/serialize';
import type { Location } from '@/types';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { VALID_LOCATION_TYPES, VALID_CUSTOMER_TYPES, VALID_INDOOR_OUTDOOR } from '@/lib/vending/locationOptions';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'locations.view')) {
    return forbiddenForPermission('locations.view');
  }

  const { id } = await params;
  const location = await locationService.findById(session.businessId, id);
  if (!location) {
    return Response.json({ error: `Location ${id} not found` }, { status: 404 });
  }
  const machines = await locationService.machinesAtLocation(session.businessId, id);
  return Response.json({ location: serializeLocation(id, location, machines.length) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'locations.manage')) {
    return forbiddenForPermission('locations.manage');
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const patch = (body ?? {}) as Record<string, unknown>;
  if (patch.customerType !== undefined && patch.customerType !== null && !VALID_CUSTOMER_TYPES.includes(patch.customerType as NonNullable<Location['customerType']>)) {
    return Response.json({ error: `customerType must be one of: ${VALID_CUSTOMER_TYPES.join(', ')}` }, { status: 400 });
  }
  if (patch.indoorOutdoor !== undefined && patch.indoorOutdoor !== null && !VALID_INDOOR_OUTDOOR.includes(patch.indoorOutdoor as NonNullable<Location['indoorOutdoor']>)) {
    return Response.json({ error: `indoorOutdoor must be one of: ${VALID_INDOOR_OUTDOOR.join(', ')}` }, { status: 400 });
  }

  if ('locationType' in patch && !VALID_LOCATION_TYPES.includes(patch.locationType as Location['locationType'])) {
    return Response.json({ error: `locationType must be one of: ${VALID_LOCATION_TYPES.join(', ')}` }, { status: 400 });
  }
  for (const key of ['name', 'city'] as const) {
    if (key in patch && (typeof patch[key] !== 'string' || !(patch[key] as string).trim())) {
      return Response.json({ error: `${key} can't be empty` }, { status: 400 });
    }
  }
  for (const key of ['latitude', 'longitude', 'estimatedFootTraffic'] as const) {
    if (key in patch && patch[key] !== null && (typeof patch[key] !== 'number' || !Number.isFinite(patch[key]))) {
      return Response.json({ error: `${key} must be a number or empty` }, { status: 400 });
    }
  }

  const fields: Partial<Omit<Location, 'businessId' | 'createdAt' | 'createdBy' | 'deletedAt'>> = {};
  if ('name' in patch) fields.name = patch.name as string;
  if ('locationType' in patch) fields.locationType = patch.locationType as Location['locationType'];
  if ('city' in patch) fields.city = patch.city as string;
  if ('area' in patch) fields.area = patch.area as string | null;
  if ('address' in patch) fields.address = patch.address as string | null;
  if ('latitude' in patch) fields.latitude = patch.latitude as number | null;
  if ('longitude' in patch) fields.longitude = patch.longitude as number | null;
  if ('estimatedFootTraffic' in patch) fields.estimatedFootTraffic = patch.estimatedFootTraffic as number | null;
  if ('operatingHours' in patch) fields.operatingHours = patch.operatingHours as string | null;
  if ('customerType' in patch) fields.customerType = patch.customerType as Location['customerType'];
  if ('indoorOutdoor' in patch) fields.indoorOutdoor = patch.indoorOutdoor as Location['indoorOutdoor'];
  if ('nearbyBusinesses' in patch) fields.nearbyBusinesses = patch.nearbyBusinesses as string[];
  if ('competingFoodBeverageOutlets' in patch) fields.competingFoodBeverageOutlets = patch.competingFoodBeverageOutlets as string[];
  if ('notes' in patch) fields.notes = patch.notes as string | null;
  if ('launchDate' in patch) {
    fields.launchDate = patch.launchDate ? (new Date(patch.launchDate as string) as unknown as Location['launchDate']) : null;
  }

  try {
    const before = await locationService.findById(session.businessId, id);
    await locationService.update(session.businessId, id, fields, session.uid);
    await recordAuditLog(request, {
      businessId: session.businessId,
      actorId: session.uid,
      action: 'update_location',
      entityType: 'location',
      entityId: id,
      before: before ? pick(before as unknown as Record<string, unknown>, Object.keys(fields)) : null,
      after: fields as Record<string, unknown>,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof LocationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, source[key] ?? null]));
}
