import { adErrorResponse, staffWith } from '@/lib/ads/routeHelpers';
import { advertisingService } from '@/services/advertisingService';
import { nairobiClock } from '@/lib/ads/playlist';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Plays, completions, failures and screen taps per campaign between `from` and `to` (Nairobi dates; default the last 30 days). `advertising.view`. */
export async function GET(request: Request): Promise<Response> {
  const session = await staffWith(request, ['advertising.view']);
  if (session instanceof Response) return session;
  const params = new URL(request.url).searchParams;
  const to = params.get('to') ?? nairobiClock(new Date()).date;
  const from = params.get('from') ?? nairobiClock(new Date(Date.now() - 29 * 86_400_000)).date;
  if (!DATE.test(from) || !DATE.test(to) || from > to) return Response.json({ error: '"from" and "to" are dates, from first.' }, { status: 400 });
  try {
    return Response.json({ from, to, campaigns: await advertisingService.campaignStats(session.businessId, from, to) });
  } catch (error) {
    return adErrorResponse(error);
  }
}
