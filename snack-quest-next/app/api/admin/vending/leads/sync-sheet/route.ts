import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { hasPermission, forbiddenForPermission } from '@/lib/auth/permissions';
import { vendingLeadService } from '@/services/vendingLeadService';
import { sheetSyncErrorMessage } from '@/lib/leads/sheetSync';

/**
 * `POST /api/admin/vending/leads/sync-sheet` — reads the Meta leads
 * Google Sheet now and brings in anything new. Safe to press any number
 * of times: rows are matched by Meta's lead id.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'owners.manage')) {
    return forbiddenForPermission('owners.manage');
  }

  try {
    const result = await vendingLeadService.syncFromGoogleSheet();
    if (!result) {
      return Response.json({ error: 'LEADS_SHEET_ID is not set in Vercel.' }, { status: 400 });
    }
    return Response.json(result);
  } catch (error) {
    console.error('[leads/sync-sheet] failed', error);
    return Response.json({ error: sheetSyncErrorMessage(error) }, { status: 502 });
  }
}
