import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { orderService, OrderNotFoundError, InvalidOrderTransitionError } from '@/services/orderService';
import { orderRepository } from '@/repositories/orderRepository';
import { seedOrder } from '../helpers/orderFixtures';
import type { ConversationCheckoutSnapshot } from '@/types';

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
  // The order-number counters live nested under each business, not in
  // a top-level collection — reset both so the numbering tests below
  // always start from a clean sequence.
  for (const businessId of [BUSINESS_ID, OTHER_BUSINESS_ID]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection('businesses').doc(businessId).collection('counters'));
  }
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

/**
 * `OrderService.createFromConversationSnapshot`'s order-number
 * allocation (§ order references) — the atomic per-business counter
 * that gives every order a short, sayable reference instead of just
 * its raw Firestore id. Called directly against a hand-built snapshot
 * rather than driving a full conversation/payment flow, since the
 * counter itself is the thing under test, not checkout or Daraja.
 */
describe('OrderService.createFromConversationSnapshot — order numbers', () => {
  function baseSnapshot(overrides: Partial<ConversationCheckoutSnapshot> = {}): ConversationCheckoutSnapshot {
    // `ConversationCheckoutSnapshot`'s Timestamp fields are typed against
    // the client `firebase/firestore` SDK, but at runtime — same as
    // every real snapshot this Service ever actually receives — this is
    // a `firebase-admin` Timestamp; the two are runtime-identical, only
    // the type declarations differ, hence the cast.
    const now = Timestamp.now() as unknown as ConversationCheckoutSnapshot['createdAt'];
    return {
      businessId: BUSINESS_ID,
      conversationId: 'conv-order-number-test',
      customerId: null,
      phoneNumber: '254712345678',
      packageId: 'pkg-order-number-test',
      packageLabel: 'Starter Box',
      customerName: 'Jane Wanjiru',
      county: 'Nairobi',
      delivery: {
        method: 'pickup',
        provider: 'jumia',
        status: 'pending',
        shippingOrigin: 'Nairobi',
        feeKes: 200,
        county: 'Nairobi',
        pickupStationId: 'station-1',
        pickupStationName: 'Test Pickup Station',
        addressText: null,
        landmark: null,
        estate: null,
        contactPhone: null,
        courierShipmentRef: null,
        trackingUrl: null,
      },
      referralCode: null,
      referralLinkId: null,
      referralOwnerId: null,
      referralCommissionKes: 0,
      subtotalKes: 2500,
      discountKes: 0,
      walletCreditAppliedKes: 0,
      deliveryFeeKes: 200,
      totalKes: 2700,
      status: 'payment_pending',
      expiresAt: now,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it('starts a fresh business at 1', async () => {
    const { orderId, orderNumber } = await orderService.createFromConversationSnapshot({
      snapshotId: 'snap-1',
      snapshot: baseSnapshot(),
      paymentIntentId: 'intent-1',
      mpesaReceiptNumber: 'ABC111',
      attribution: null,
    });

    expect(orderNumber).toBe(1);
    const order = await orderRepository.findById(orderId);
    expect(order?.orderNumber).toBe(1);
  });

  it('allocates strictly increasing numbers, one per order, for the same business', async () => {
    const first = await orderService.createFromConversationSnapshot({
      snapshotId: 'snap-1',
      snapshot: baseSnapshot({ conversationId: 'conv-1' }),
      paymentIntentId: 'intent-1',
      mpesaReceiptNumber: 'ABC111',
      attribution: null,
    });
    const second = await orderService.createFromConversationSnapshot({
      snapshotId: 'snap-2',
      snapshot: baseSnapshot({ conversationId: 'conv-2' }),
      paymentIntentId: 'intent-2',
      mpesaReceiptNumber: 'ABC222',
      attribution: null,
    });

    expect(first.orderNumber).toBe(1);
    expect(second.orderNumber).toBe(2);
  });

  it('keeps each business on its own independent sequence', async () => {
    const sq = await orderService.createFromConversationSnapshot({
      snapshotId: 'snap-1',
      snapshot: baseSnapshot({ businessId: BUSINESS_ID, conversationId: 'conv-sq' }),
      paymentIntentId: 'intent-sq',
      mpesaReceiptNumber: 'ABC111',
      attribution: null,
    });
    const other = await orderService.createFromConversationSnapshot({
      snapshotId: 'snap-2',
      snapshot: baseSnapshot({ businessId: OTHER_BUSINESS_ID, conversationId: 'conv-other' }),
      paymentIntentId: 'intent-other',
      mpesaReceiptNumber: 'ABC222',
      attribution: null,
    });

    expect(sq.orderNumber).toBe(1);
    expect(other.orderNumber).toBe(1);
  });
});
