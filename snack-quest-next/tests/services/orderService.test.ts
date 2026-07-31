import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { orderService, OrderNotFoundError, InvalidOrderTransitionError } from '@/services/orderService';
import { seedOrder } from '../helpers/orderFixtures';

/**
 * `OrderService.updateStatus` (§ Admin: Orders) — the one place
 * transition legality is enforced and the audit event is published,
 * so this proves both against the real emulator rather than the
 * repository mock hiding a bad transition table.
 */

const BUSINESS_ID = 'biz-order-service-test';
const OTHER_BUSINESS_ID = 'biz-order-service-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('orders'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('domainEvents'));
});

describe('OrderService.updateStatus', () => {
  it('applies a valid transition and publishes a domain event', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'confirmed' });

    const updated = await orderService.updateStatus(BUSINESS_ID, orderId, 'dispatched', 'staff-uid-1');

    expect(updated.status).toBe('dispatched');
    const doc = await adminFirestore.collection('orders').doc(orderId).get();
    expect(doc.data()?.status).toBe('dispatched');

    const events = await adminFirestore.collection('domainEvents').get();
    const event = events.docs.map((d) => d.data()).find((d) => d.type === 'OrderStatusChanged');
    expect(event).toMatchObject({
      businessId: BUSINESS_ID,
      aggregateId: orderId,
      payload: { from: 'confirmed', to: 'dispatched', actor: 'staff-uid-1' },
    });
  });

  it('rejects an illegal transition without writing anything', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'delivered' });

    await expect(
      orderService.updateStatus(BUSINESS_ID, orderId, 'confirmed', 'staff-uid-1'),
    ).rejects.toBeInstanceOf(InvalidOrderTransitionError);

    const doc = await adminFirestore.collection('orders').doc(orderId).get();
    expect(doc.data()?.status).toBe('delivered');
  });

  it('rejects a transition from a terminal status', async () => {
    const orderId = await seedOrder({ businessId: BUSINESS_ID, status: 'cancelled' });

    await expect(
      orderService.updateStatus(BUSINESS_ID, orderId, 'dispatched', 'staff-uid-1'),
    ).rejects.toBeInstanceOf(InvalidOrderTransitionError);
  });

  it('throws OrderNotFoundError for a nonexistent order', async () => {
    await expect(
      orderService.updateStatus(BUSINESS_ID, 'does-not-exist', 'dispatched', 'staff-uid-1'),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it('throws OrderNotFoundError when the order belongs to a different business', async () => {
    const orderId = await seedOrder({ businessId: OTHER_BUSINESS_ID, status: 'confirmed' });

    await expect(
      orderService.updateStatus(BUSINESS_ID, orderId, 'dispatched', 'staff-uid-1'),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
