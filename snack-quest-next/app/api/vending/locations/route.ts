import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { locationService } from '@/services/locationService';
import { serializeLocation } from '@/lib/vending/serialize';
import type { Location } from '@/types';

const VALID_LOCATION_TYPES: Location['locationType'][] = [
  'university',
  'hotel',
  'office',
  'hospital',
  'mall',
  'airport',
  'transport_hub',
  'bnb',
  'corporate',
  'other',
];

const VALID_CUSTOMER_TYPES: NonNullable<Location['customerType']>[] = [
  'students',
  'employees',
  'travelers',
  'patients_and_visitors',
  'general_public',
  'mixed',
  'other',
];

const VALID_INDOOR_OUTDOOR: NonNullable<Location['indoorOutdoor']>[] = ['indoor', 'outdoor', 'mixed'];

/**
 * The location profile domain's own staff surface
 * (§ LOCATION PROFILE, docs/SNACK_INTELLIGENCE.md). Read/write gated
 * the same as every other fleet-operations read (`ADMIN_FINANCE_OR_WAREHOUSE`)
 * — a location profile is operational data, not financial-write-grade,
 * so it does not need `ADMIN_ONLY`.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const url = new URL(request.url);
  const locationType = url.searchParams.get('locationType');
  if (locationType && !VALID_LOCATION_TYPES.includes(locationType as Location['locationType'])) {
    return Response.json({ error: `locationType must be one of: ${VALID_LOCATION_TYPES.join(', ')}` }, { status: 400 });
  }

  const rows = locationType
    ? await locationService.listByType(session.businessId, locationType as Location['locationType'])
    : await locationService.listByBusiness(session.businessId);

  const locations = await Promise.all(
    rows.map(async ({ id, data }) => {
      const machines = await locationService.machinesAtLocation(session.businessId, id);
      return serializeLocation(id, data, machines.length);
    }),
  );

  return Response.json({ locations });
}

export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const {
    name,
    locationType,
    city,
    area,
    address,
    latitude,
    longitude,
    estimatedFootTraffic,
    operatingHours,
    customerType,
    indoorOutdoor,
    nearbyBusinesses,
    competingFoodBeverageOutlets,
    launchDate,
    notes,
  } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== 'string' || !name) {
    return Response.json({ error: 'name is required' }, { status: 400 });
  }
  if (typeof locationType !== 'string' || !VALID_LOCATION_TYPES.includes(locationType as Location['locationType'])) {
    return Response.json({ error: `locationType must be one of: ${VALID_LOCATION_TYPES.join(', ')}` }, { status: 400 });
  }
  if (typeof city !== 'string' || !city) {
    return Response.json({ error: 'city is required' }, { status: 400 });
  }
  if (customerType !== undefined && customerType !== null && !VALID_CUSTOMER_TYPES.includes(customerType as NonNullable<Location['customerType']>)) {
    return Response.json({ error: `customerType must be one of: ${VALID_CUSTOMER_TYPES.join(', ')}` }, { status: 400 });
  }
  if (indoorOutdoor !== undefined && indoorOutdoor !== null && !VALID_INDOOR_OUTDOOR.includes(indoorOutdoor as NonNullable<Location['indoorOutdoor']>)) {
    return Response.json({ error: `indoorOutdoor must be one of: ${VALID_INDOOR_OUTDOOR.join(', ')}` }, { status: 400 });
  }

  const locationId = await locationService.create({
    businessId: session.businessId,
    name,
    locationType: locationType as Location['locationType'],
    city,
    area: (area as string | null) ?? null,
    address: (address as string | null) ?? null,
    latitude: (latitude as number | null) ?? null,
    longitude: (longitude as number | null) ?? null,
    estimatedFootTraffic: (estimatedFootTraffic as number | null) ?? null,
    operatingHours: (operatingHours as string | null) ?? null,
    customerType: (customerType as Location['customerType']) ?? null,
    indoorOutdoor: (indoorOutdoor as Location['indoorOutdoor']) ?? null,
    nearbyBusinesses: Array.isArray(nearbyBusinesses) ? (nearbyBusinesses as string[]) : [],
    competingFoodBeverageOutlets: Array.isArray(competingFoodBeverageOutlets) ? (competingFoodBeverageOutlets as string[]) : [],
    launchDate: launchDate ? new Date(launchDate as string) : null,
    notes: (notes as string | null) ?? null,
    actor: session.uid,
  });

  return Response.json({ locationId }, { status: 201 });
}
