import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { peerLearningService } from '@/services/peerLearningService';
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

/** A ranked assortment candidate list for a proposed new machine (§ NEW MACHINE ASSORTMENT RECOMMENDATION) — ranked by real peer performance, never a hard-coded composition. */
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

  const { locationType, slotCount, priceBandKes } = (body ?? {}) as Record<string, unknown>;
  if (typeof locationType !== 'string' || !VALID_LOCATION_TYPES.includes(locationType as Location['locationType'])) {
    return Response.json({ error: `locationType must be one of: ${VALID_LOCATION_TYPES.join(', ')}` }, { status: 400 });
  }
  if (typeof slotCount !== 'number' || !Number.isInteger(slotCount) || slotCount < 1 || slotCount > 200) {
    return Response.json({ error: 'slotCount must be an integer between 1 and 200' }, { status: 400 });
  }
  let priceBand: { min: number; max: number } | undefined;
  if (priceBandKes !== undefined && priceBandKes !== null) {
    const band = priceBandKes as Record<string, unknown>;
    if (typeof band.min !== 'number' || typeof band.max !== 'number' || band.min > band.max) {
      return Response.json({ error: 'priceBandKes must be { min: number, max: number } with min <= max' }, { status: 400 });
    }
    priceBand = { min: band.min, max: band.max };
  }

  const candidates = await peerLearningService.recommendAssortmentForNewMachine(session.businessId, locationType as Location['locationType'], slotCount, priceBand);
  return Response.json({ candidates });
}
