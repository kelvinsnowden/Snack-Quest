import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { orderMeetingService } from '@/services/orderMeetingService';

/**
 * Sends the order-meeting reminder texts that are due: a day before and
 * an hour before each meeting (§ order meetings).
 *
 * The hour-before text needs this called every few minutes, which the
 * Vercel plan's once-a-day crons cannot do. So it is called by an
 * outside scheduler with the cron secret, by the GitHub workflow, by
 * the daily Vercel cron as a floor, and after every /meet and Leads
 * page load. Each text is claimed before it is sent, so callers that
 * overlap never send it twice.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return Response.json(await orderMeetingService.sendDueReminders());
}
