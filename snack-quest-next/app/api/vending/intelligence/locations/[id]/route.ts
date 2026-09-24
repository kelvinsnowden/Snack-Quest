import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasStaffRole, ADMIN_FINANCE_OR_WAREHOUSE, forbiddenResponse } from '@/lib/auth/requireStaffRole';
import { locationIntelligenceService, LocationNotFoundError } from '@/services/locationIntelligenceService';
import { networkIntelligenceService } from '@/services/networkIntelligenceService';
import { parseWindowDays } from '@/lib/vending/intelligenceQueryParams';

/**
 * One location's Location DNA (§ LOCATION DNA), or, with `?compare=id2,id3`,
 * this location benchmarked side by side with others
 * (§ LOCATION BENCHMARKING — each location's own real metrics,
 * never a composite "winner").
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasStaffRole(session, ADMIN_FINANCE_OR_WAREHOUSE)) {
    return forbiddenResponse();
  }

  const { id } = await params;
  const windowDays = parseWindowDays(request);
  if (windowDays instanceof Response) {
    return windowDays;
  }

  const url = new URL(request.url);
  const compareParam = url.searchParams.get('compare');

  try {
    if (compareParam) {
      const otherIds = compareParam.split(',').map((s) => s.trim()).filter(Boolean);
      const comparison = await networkIntelligenceService.compareLocations(session.businessId, [id, ...otherIds], windowDays);
      return Response.json({ comparison });
    }
    const dna = await locationIntelligenceService.getLocationDna(session.businessId, id, windowDays);
    return Response.json({ dna });
  } catch (error) {
    if (error instanceof LocationNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
