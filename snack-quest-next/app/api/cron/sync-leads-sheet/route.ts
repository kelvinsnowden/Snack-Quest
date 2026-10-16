import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { vendingLeadService } from '@/services/vendingLeadService';

/**
 * Daily safety net for the Meta leads sheet. The Leads page also syncs
 * whenever it is opened, so this only matters on days nobody looks.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await vendingLeadService.syncFromGoogleSheet();
    return Response.json(result ?? { skipped: 'LEADS_SHEET_ID is not set' });
  } catch (error) {
    console.error('[cron/sync-leads-sheet] failed', error);
    return Response.json({ error: 'sync failed' }, { status: 500 });
  }
}
