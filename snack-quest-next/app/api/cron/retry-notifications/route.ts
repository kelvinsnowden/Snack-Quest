import { notificationService } from '@/services/notificationService';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';

/**
 * The retry sweep's real trigger (§ Notification breadth,
 * `NotificationService.retrySweep`) — Vercel Cron, configured in
 * `vercel.json`'s `crons` entry, is the platform's actual scheduled-job
 * mechanism (this codebase has no other; see the payment-reconciliation
 * feature, which is on-demand/query-based, not a real sweep). Vercel
 * signs cron invocations with `Authorization: Bearer $CRON_SECRET`
 * (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)
 * — the same shared-secret discipline as `INTERNAL_AGENT_API_KEY` for
 * the door-delivery pricing route, since there's no real staff/service
 * identity to check instead.
 *
 * Scoped to `getCurrentBusinessId()`, not "every business" — this
 * deployment has one real tenant (ADR-0006: multi-tenancy is a
 * reserved seam, not built infrastructure, until a second tenant is
 * funded), matching `app/r/[code]/route.ts`'s own use of the same
 * helper.
 */
export async function GET(request: Request): Promise<Response> {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const businessId = getCurrentBusinessId();
  const result = await notificationService.retrySweep(businessId);
  return Response.json({ ok: true, ...result });
}
