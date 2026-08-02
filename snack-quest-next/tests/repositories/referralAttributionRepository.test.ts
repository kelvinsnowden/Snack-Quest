import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { createInTransaction, referralAttributionRepository } from '@/repositories/referralAttributionRepository';

/** `referralAttributionRepository.listByBusiness` — the commission ledger read (§ Admin: Referrals). */

const BUSINESS_ID = 'biz-referral-attribution-repo-test';
const OTHER_BUSINESS_ID = 'biz-referral-attribution-repo-other';

async function seedAttribution(overrides: Partial<Parameters<typeof createInTransaction>[1]> = {}) {
  await adminFirestore.runTransaction(async (tx) => {
    createInTransaction(tx, {
      businessId: BUSINESS_ID,
      referralLinkId: 'link-1',
      creatorId: 'creator-1',
      orderId: 'order-1',
      conversationId: 'conv-1',
      discountKes: 100,
      commissionKes: 50,
      ...overrides,
    });
  });
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('referralAttributions'));
});

describe('referralAttributionRepository.listByBusiness', () => {
  it('lists only the given business, newest first', async () => {
    await seedAttribution({ businessId: OTHER_BUSINESS_ID, orderId: 'order-other' });
    await seedAttribution({ orderId: 'order-first' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await seedAttribution({ orderId: 'order-second' });

    const { attributions, nextCursor } = await referralAttributionRepository.listByBusiness(BUSINESS_ID);

    expect(attributions.map((a) => a.data.orderId)).toEqual(['order-second', 'order-first']);
    expect(nextCursor).toBeNull();
  });

  it('paginates with a cursor', async () => {
    for (let i = 0; i < 3; i += 1) {
      await seedAttribution({ orderId: `order-${i}` });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const firstPage = await referralAttributionRepository.listByBusiness(BUSINESS_ID, { limit: 2 });
    expect(firstPage.attributions).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await referralAttributionRepository.listByBusiness(BUSINESS_ID, {
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.attributions).toHaveLength(1);
  });
});

describe('referralAttributionRepository.listByCreator', () => {
  it('lists only the given creator’s attributions within the business, newest first', async () => {
    await seedAttribution({ creatorId: 'creator-1', orderId: 'order-mine' });
    await seedAttribution({ creatorId: 'creator-2', orderId: 'order-theirs' });
    await seedAttribution({ businessId: OTHER_BUSINESS_ID, creatorId: 'creator-1', orderId: 'order-other-biz' });

    const { attributions } = await referralAttributionRepository.listByCreator(BUSINESS_ID, 'creator-1');

    expect(attributions).toHaveLength(1);
    expect(attributions[0].data.orderId).toBe('order-mine');
  });
});
