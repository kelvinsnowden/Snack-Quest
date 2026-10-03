import { recordAuditLog } from '@/lib/audit/recordAuditLog';
import { adErrorResponse, iso, staffWith } from '@/lib/ads/routeHelpers';
import { advertisingService } from '@/services/advertisingService';

/**
 * Advertising revenue for a month (§ AD REVENUE): what each campaign
 * earned and each owner's share. Money, so it needs `finance.view` or
 * `finance.machine_pnl.view` — seeing campaigns (`advertising.view`) is
 * not enough. POST recomputes the month from playback.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await staffWith(request, ['finance.view', 'finance.machine_pnl.view']);
  if (session instanceof Response) return session;
  const month = new URL(request.url).searchParams.get('month') ?? '';
  try {
    const entries = await advertisingService.listRevenue(session.businessId, month);
    return Response.json({ month, entries: entries.map((entry) => ({ ...entry, computedAt: iso(entry.computedAt) })) });
  } catch (error) {
    return adErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await staffWith(request, ['finance.view', 'finance.machine_pnl.view']);
  if (session instanceof Response) return session;
  const month = new URL(request.url).searchParams.get('month') ?? '';
  try {
    const entries = await advertisingService.computeRevenueForMonth(session.businessId, month, session.uid);
    await recordAuditLog(request, { businessId: session.businessId, actorId: session.uid, action: 'ad_revenue.compute', entityType: 'adRevenue', entityId: month, after: { campaigns: entries.length, grossKes: entries.reduce((sum, entry) => sum + entry.grossKes, 0) } });
    return Response.json({ month, entries });
  } catch (error) {
    return adErrorResponse(error);
  }
}
