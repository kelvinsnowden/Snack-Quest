import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { paymentIntentRepository } from '@/repositories/paymentIntentRepository';

const BUSINESS_ID = 'biz-payment-intent-repo-test';
const OTHER_BUSINESS_ID = 'biz-payment-intent-repo-other';

const BASE_INPUT = {
  businessId: BUSINESS_ID,
  conversationId: 'conv-1',
  conversationCheckoutSnapshotId: 'snap-1',
  customerId: null,
  phoneNumber: '254700000001',
  amountKes: 2500,
};

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('paymentIntents'));
});

describe('PaymentIntentRepository.listByStatus', () => {
  it('returns only intents matching the requested statuses, newest first', async () => {
    const failedId = await paymentIntentRepository.create(BASE_INPUT);
    await paymentIntentRepository.updateStatus(failedId, 'failed');

    const expiredId = await paymentIntentRepository.create(BASE_INPUT);
    await paymentIntentRepository.updateStatus(expiredId, 'expired');

    const succeededId = await paymentIntentRepository.create(BASE_INPUT);
    await paymentIntentRepository.updateStatus(succeededId, 'succeeded');

    const results = await paymentIntentRepository.listByStatus(BUSINESS_ID, ['failed', 'expired']);
    expect(results.map((r) => r.id).sort()).toEqual([expiredId, failedId].sort());
    expect(results.every((r) => ['failed', 'expired'].includes(r.data.status))).toBe(true);
  });

  it('never leaks another business\'s failed intents', async () => {
    const id = await paymentIntentRepository.create({ ...BASE_INPUT, businessId: OTHER_BUSINESS_ID });
    await paymentIntentRepository.updateStatus(id, 'failed');

    const results = await paymentIntentRepository.listByStatus(BUSINESS_ID, ['failed', 'expired']);
    expect(results).toHaveLength(0);
  });
});
