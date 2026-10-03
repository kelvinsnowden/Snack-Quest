import { verifyPartnerSessionFromRequest } from '@/lib/auth/partnerSession';
import { ownerProfitabilityService } from '@/services/ownerProfitabilityService';
import { resolvePeriod } from '@/lib/finance/periods';

/**
 * § OWNER PROFITABILITY — the owner's own margins across their machines:
 * `?preset=today|yesterday|7d|30d|this_month|last_month|custom&from=&to=`
 * plus optional `machineId`, `locationId`, `productId`, `category`. Only this
 * owner's machines are ever read; a filter naming another owner's machine
 * simply matches nothing. Snack Quest's own costs are never in the response.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyPartnerSessionFromRequest(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const period = resolvePeriod({ preset: params.get('preset'), from: params.get('from'), to: params.get('to') });
  const report = await ownerProfitabilityService.report(session.businessId, session.partnerId, period, {
    machineId: params.get('machineId'),
    locationId: params.get('locationId'),
    productId: params.get('productId'),
    category: params.get('category'),
  });
  return Response.json(report);
}
