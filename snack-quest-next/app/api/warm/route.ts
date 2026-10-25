import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { warmUp } from '@/lib/observability/warmUp';

/**
 * Keeps a server ready for staff and owners: an outside scheduler calls this
 * every few minutes (`Authorization: Bearer <CRON_SECRET>`), which keeps an
 * instance alive with Firestore and Firebase Auth already connected, so the
 * next real visit skips the cold start. Cheap: one document read and one
 * "no such user" lookup, once per server.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return Response.json({ ok: true, ...(await warmUp()) });
}
