import 'server-only';

import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { ownerInvoiceService } from '@/services/ownerInvoiceService';

/**
 * Owner subscriptions whose period ended unpaid: the first time, a grace
 * window opens; once grace has passed, the missed amount becomes arrears
 * and the subscription moves to `in_arrears`. Never touches one that was
 * paid or waived. The rule is `machineSubscriptionService.reconcileArrears`;
 * this only makes sure it runs. Also issues owner invoices that are due
 * (fee periods, and deliveries whose invoice wasn't issued at the time).
 */
export async function reconcileSubscriptionArrears(businessId: string): Promise<Record<string, unknown>> {
  // Invoiced owners first: a fee period whose invoice was paid moves on before the arrears check reads it.
  const { feeInvoices, deliveryInvoices } = await ownerInvoiceService.issueDue(businessId);
  const { enteredGrace, movedToArrears } = await machineSubscriptionService.reconcileArrears(businessId);
  return { enteredGrace, movedToArrears, feeInvoices, deliveryInvoices };
}
