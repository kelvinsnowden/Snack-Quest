import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { orderRepository } from '@/repositories/orderRepository';
import { seedOrder } from '../helpers/orderFixtures';

/**
 * The Admin Orders list/search/status-update queries (§ Admin: Orders)
 * against the real emulator — proves the composite-index-shaped
 * queries in `firestore.indexes.json` actually match what's issued
 * here, not just that the TypeScript compiles.
 */

const BUSINESS_ID = 'biz-order-repo-test';
const OTHER_BUSINESS_ID = 'biz-order-repo-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('orders'));
});

describe('orderRepository.listByBusiness', () => {
  it('lists only the given business, newest first', async () => {
    await seedOrder({ businessId: OTHER_BUSINESS_ID });
    const first = await seedOrder({ businessId: BUSINESS_ID });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await seedOrder({ businessId: BUSINESS_ID });

    const { orders, nextCursor } = await orderRepository.listByBusiness(BUSINESS_ID);

    expect(orders.map((o) => o.id)).toEqual([second, first]);
    expect(nextCursor).toBeNull();
  });

  it('filters by status', async () => {
    await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed' });
    const dispatched = await seedOrder({ businessId: BUSINESS_ID, status: 'dispatched' });

    const { orders } = await orderRepository.listByBusiness(BUSINESS_ID, { status: 'dispatched' });

    expect(orders.map((o) => o.id)).toEqual([dispatched]);
  });

  it('paginates with a cursor', async () => {
    for (let i = 0; i < 3; i += 1) {
      await seedOrder({ businessId: BUSINESS_ID });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const firstPage = await orderRepository.listByBusiness(BUSINESS_ID, { limit: 2 });
    expect(firstPage.orders).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await orderRepository.listByBusiness(BUSINESS_ID, {
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.orders).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
  });
});

describe('orderRepository.searchByPhoneNumber', () => {
  it('finds an exact phone match scoped to the business', async () => {
    await seedOrder({ businessId: OTHER_BUSINESS_ID, customer: { customerId: null, phoneNumber: '254700000000', customerName: 'Other', county: 'Nairobi' } });
    const match = await seedOrder({
      businessId: BUSINESS_ID,
      customer: { customerId: null, phoneNumber: '254700000000', customerName: 'Match', county: 'Nairobi' },
    });

    const results = await orderRepository.searchByPhoneNumber(BUSINESS_ID, '254700000000');

    expect(results.map((r) => r.id)).toEqual([match]);
  });
});

describe('orderRepository.searchByCustomerNamePrefix', () => {
  it('finds a case-sensitive name prefix match scoped to the business', async () => {
    const match = await seedOrder({
      businessId: BUSINESS_ID,
      customer: { customerId: null, phoneNumber: '254711111111', customerName: 'Jane Wanjiru', county: 'Nairobi' },
    });
    await seedOrder({
      businessId: BUSINESS_ID,
      customer: { customerId: null, phoneNumber: '254722222222', customerName: 'John Kamau', county: 'Nairobi' },
    });

    const results = await orderRepository.searchByCustomerNamePrefix(BUSINESS_ID, 'Jane');

    expect(results.map((r) => r.id)).toEqual([match]);
  });
});

describe('orderRepository.updateStatus', () => {
  it('persists status, actor, and an optional reason', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed' });

    await orderRepository.updateStatus(orderId, 'cancelled', 'staff-uid-1', 'Out of stock');

    const doc = await adminFirestore.collection('orders').doc(orderId).get();
    expect(doc.data()?.status).toBe('cancelled');
    expect(doc.data()?.updatedBy).toBe('staff-uid-1');
    expect(doc.data()?.statusReason).toBe('Out of stock');
  });
});

describe('orderRepository.countByBusiness', () => {
  it('counts only the given business', async () => {
    await seedOrder({ businessId: BUSINESS_ID });
    await seedOrder({ businessId: BUSINESS_ID });
    await seedOrder({ businessId: OTHER_BUSINESS_ID });

    await expect(orderRepository.countByBusiness(BUSINESS_ID)).resolves.toBe(2);
  });
});
