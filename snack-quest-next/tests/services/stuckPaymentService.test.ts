import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { paymentIntentRepository } from '@/repositories/paymentIntentRepository';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { listStuckPayments, lastAutomaticPaymentCheck } from '@/services/stuckPaymentService';

/**
 * The Reconciliation page's "Waiting for payment confirmation" list: a
 * customer who was sent an M-Pesa prompt and never became an order is
 * visible with what they chose, whether or not anyone pressed "Check now".
 */

const BUSINESS_ID = 'biz-stuck-payments';

async function stuck(snapshotId: string, status: 'processing' | 'expired', snapshotStatus = 'ready') {
  await adminFirestore.collection('conversationCheckoutSnapshots').doc(snapshotId).set({
    businessId: BUSINESS_ID,
    conversationId: `conv-${snapshotId}`,
    status: snapshotStatus,
    packageLabel: 'Premium Box',
    quantity: 1,
    customerName: 'Halima',
    totalKes: 5250,
    guaranteedPicks: [{ snackItemId: 'a', name: 'D21', origin: null, imageUrl: null }, { snackItemId: 'b', name: 'SK 10', origin: 'Korea', imageUrl: null }],
  });
  const intentId = await paymentIntentRepository.create({ businessId: BUSINESS_ID, conversationId: `conv-${snapshotId}`, conversationCheckoutSnapshotId: snapshotId, customerId: null, phoneNumber: '254711000000', amountKes: 5250 });
  const checkoutRequestId = `ws_CO_${intentId}`;
  await paymentIntentRepository.addAttempt(intentId, { checkoutRequestId, merchantRequestId: `m_${intentId}`, status: 'initiated', resultCode: null, resultDesc: null, mpesaReceiptNumber: null });
  await paymentIntentRepository.updateStatus(intentId, status);
  return { intentId, checkoutRequestId };
}

beforeEach(async () => {
  for (const collection of ['paymentIntents', 'conversationCheckoutSnapshots', 'webhookEvents', 'scheduledJobRuns']) {
    const snapshot = await adminFirestore.collection(collection).where('businessId', '==', BUSINESS_ID).get();
    await Promise.all(snapshot.docs.map((doc) => adminFirestore.recursiveDelete(doc.ref)));
  }
});

describe('listStuckPayments', () => {
  it('lists processing and expired payments with the customer, box and picks', async () => {
    const { intentId } = await stuck('snap-1', 'processing');
    await stuck('snap-2', 'expired');
    const list = await listStuckPayments(BUSINESS_ID);
    expect(list).toHaveLength(2);
    const row = list.find((entry) => entry.intentId === intentId)!;
    expect(row).toMatchObject({ customerName: 'Halima', boxLabel: 'Premium Box', amountKes: 5250, picks: ['D21', 'SK 10'], safaricomConfirmed: false, status: 'processing' });
  });

  it('marks a payment Safaricom already confirmed, so only the receipt is missing', async () => {
    const { intentId, checkoutRequestId } = await stuck('snap-1', 'processing');
    await webhookEventRepository.recordIfNew({ businessId: BUSINESS_ID, provider: 'daraja', eventKind: 'stk_query_reconciliation', providerEventId: `${checkoutRequestId}:query-confirmed-success`, payload: {}, relatedEntityId: intentId });
    const [row] = await listStuckPayments(BUSINESS_ID);
    expect(row.safaricomConfirmed).toBe(true);
  });

  it('leaves out checkouts that already became orders, and payments that settled', async () => {
    await stuck('snap-done', 'processing', 'completed');
    const { intentId } = await stuck('snap-paid', 'processing');
    await paymentIntentRepository.updateStatus(intentId, 'succeeded');
    expect(await listStuckPayments(BUSINESS_ID)).toEqual([]);
  });
});

describe('lastAutomaticPaymentCheck', () => {
  it('is null when the overnight check has never run', async () => {
    expect(await lastAutomaticPaymentCheck(BUSINESS_ID)).toBeNull();
  });
});
