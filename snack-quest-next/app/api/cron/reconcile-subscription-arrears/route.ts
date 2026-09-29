import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';
import { reconcileSubscriptionArrears } from '@/services/jobs/reconcileSubscriptionArrears';

/** Daily: unpaid owner subscriptions enter grace, then arrears. Also on Operations → Run now. */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const businessId = getCurrentBusinessId();
  const outcome = await scheduledJobService.run(businessId, 'reconcile-subscription-arrears', () => reconcileSubscriptionArrears(businessId));
  return scheduledJobService.toResponse(outcome);
}
