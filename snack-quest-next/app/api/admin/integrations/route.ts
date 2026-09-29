import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { integrationSettingsService } from '@/services/integrationSettingsService';
import { hasPermission } from '@/lib/auth/permissions';

/** Lists every integration's status + masked field values (§ Integration Portal). */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'settings.integrations.manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const integrations = await integrationSettingsService.listSummaries(session.businessId);
  return Response.json({ integrations });
}
