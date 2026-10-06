import 'server-only';

import { paymentIntentRepository } from '@/repositories/paymentIntentRepository';
import { conversationCheckoutSnapshotRepository } from '@/repositories/conversationCheckoutSnapshotRepository';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';

/** How far back the Reconciliation page looks for payments that never settled. */
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

export interface StuckPayment {
  intentId: string;
  status: 'processing' | 'expired';
  startedAt: string;
  amountKes: number;
  phoneNumber: string;
  customerName: string | null;
  boxLabel: string | null;
  picks: string[];
  /** Safaricom said "succeeded" when asked, but no receipt arrived — it only needs the receipt typed in. */
  safaricomConfirmed: boolean;
}

/**
 * Payments that left a customer with no order (§ payment reconciliation:
 * stuck payments): M-Pesa was asked for money and never told us the
 * result (`processing`), or the overnight check gave up waiting
 * (`expired`). Checkouts that already became orders are left out.
 * Before this, such a payment was invisible in Admin until someone
 * pressed "Check now" — and then only until they left the page.
 */
export async function listStuckPayments(businessId: string): Promise<StuckPayment[]> {
  const intents = await paymentIntentRepository.listByStatus(businessId, ['processing', 'expired'], 100);
  const cutoff = Date.now() - LOOKBACK_MS;
  const rows = await Promise.all(
    intents
      .filter(({ data }) => data.createdAt.toMillis() >= cutoff)
      .map(async ({ id, data }): Promise<StuckPayment | null> => {
        const [snapshot, pending] = await Promise.all([
          conversationCheckoutSnapshotRepository.findById(data.conversationCheckoutSnapshotId),
          paymentIntentRepository.getPendingAttempt(id),
        ]);
        if (snapshot?.status === 'completed') return null;
        const safaricomConfirmed = pending ? await webhookEventRepository.exists(businessId, 'daraja', `${pending.checkoutRequestId}:query-confirmed-success`) : false;
        return {
          intentId: id,
          status: data.status as 'processing' | 'expired',
          startedAt: data.createdAt.toDate().toISOString(),
          amountKes: data.amountKes,
          phoneNumber: data.phoneNumber,
          customerName: snapshot?.customerName ?? null,
          boxLabel: snapshot ? `${(snapshot.quantity ?? 1) > 1 ? `${snapshot.quantity} × ` : ''}${snapshot.packageLabel}` : null,
          picks: (snapshot?.guaranteedPicks ?? []).map((pick) => pick.name),
          safaricomConfirmed,
        };
      }),
  );
  return rows.filter((row): row is StuckPayment => row !== null).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** When the automatic overnight payment check last ran, and how — `null` when it never has. */
export async function lastAutomaticPaymentCheck(businessId: string): Promise<{ startedAt: string | null; status: string } | null> {
  const [latest] = await scheduledJobRunRepository.listRecentForJob(businessId, 'reconcile-stk-payments', 1);
  if (!latest) return null;
  return { startedAt: latest.data.startedAt?.toDate().toISOString() ?? null, status: latest.data.status };
}
