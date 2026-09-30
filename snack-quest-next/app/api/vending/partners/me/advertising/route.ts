import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { advertisingService, AdValidationError } from '@/services/advertisingService';
import { nairobiClock } from '@/lib/ads/playlist';

/**
 * § OWNER PORTAL — ADVERTISING: completed ad plays on this owner's
 * machines in `?month=YYYY-MM` (default this month) and their share of the
 * revenue. Only this owner's machines are read; advertisers' prices and
 * other owners' figures are never in the response.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const month = new URL(request.url).searchParams.get('month') ?? nairobiClock(new Date()).date.slice(0, 7);
  try {
    return Response.json(await advertisingService.ownerSummary(session.businessId, session.partnerId, month));
  } catch (error) {
    if (error instanceof AdValidationError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
