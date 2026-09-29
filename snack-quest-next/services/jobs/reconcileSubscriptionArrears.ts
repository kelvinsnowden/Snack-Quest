import 'server-only';

import { machineSubscriptionService } from '@/services/machineSubscriptionService';

/**
 * Owner subscriptions whose period ended unpaid: the first time, a grace
 * window opens; once grace has passed, the missed amount becomes arrears
 * and the subscription moves to `in_arrears`. Never touches one that was
 * paid or waived. The rule is `machineSubscriptionService.reconcileArrears`;
 * this only makes sure it runs.
 */
export async function reconcileSubscriptionArrears(businessId: string): Promise<Record<string, unknown>> {
  const { enteredGrace, movedToArrears } = await machineSubscriptionService.reconcileArrears(businessId);
  return { enteredGrace, movedToArrears };
}
