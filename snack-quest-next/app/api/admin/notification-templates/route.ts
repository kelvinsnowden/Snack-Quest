import { verifyStaffSessionFromRequest } from '@/lib/auth/session';
import { notificationTemplateService } from '@/services/notificationTemplateService';
import { hasPermission } from '@/lib/auth/permissions';

/** Lists the full, platform-wide notification template catalog (§ Admin: Notification Templates) — small and unpaginated, same as the Service/Repository it calls through. */
export async function GET(request: Request): Promise<Response> {
  const session = await verifyStaffSessionFromRequest(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session, 'settings.notifications.manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const templates = await notificationTemplateService.listAll();
  return Response.json({ templates });
}
