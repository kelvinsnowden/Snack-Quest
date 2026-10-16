import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { leadNurtureService } from '@/services/leadNurtureService';

/**
 * Daily, 09:00 Nairobi: sends the lead nurture emails that are due and
 * reminds leads of calls booked within the next day (§ lead nurture).
 * The Leads page also triggers a run when opened, so new leads don't
 * wait for this.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return Response.json(await leadNurtureService.runDue());
}
