import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { ConversationService, conversationService } from '@/services/conversationService';
import { FakeWhatsAppGateway } from '../helpers/fakeWhatsAppGateway';
import { orderService } from '@/services/orderService';
import { packageRepository } from '@/repositories/packageRepository';
import { pickupStationRepository } from '@/repositories/pickupStationRepository';
import { deliveryZoneRuleRepository } from '@/repositories/deliveryZoneRuleRepository';
import { orderRepository } from '@/repositories/orderRepository';
import { notificationTemplateRepository } from '@/repositories/notificationTemplateRepository';

/**
 * Recording an order without telling the customer
 * (§ quiet manual orders).
 *
 * The case is an order entered *after* it happened — a box handed over
 * at a stand, or already delivered and written up afterwards. Three
 * customer-facing messages fire for a staff order, and every one of
 * them is wrong for that box:
 *
 *   1. the WhatsApp confirmation, "we're preparing your box and Tushop
 *      will bring it to your door";
 *   2. the `order_confirmed_sms`;
 *   3. `order_dispatched_sms`, "on its way", days later when a staff
 *      member moves the order along.
 *
 * The third is the one worth the most care here, because it fires from
 * a different request — so it is not enough to skip a message at
 * creation time; the decision has to survive onto the order.
 */

const BUSINESS_ID = 'biz-quiet-order-test';
const STAFF = { staffUid: 'staff-1', staffName: 'Kelvin' };

let packageId: string;
let stationId: string;

async function outbound(): Promise<{ id: string; template: string }[]> {
  const snapshot = await adminFirestore.collection('outboundMessages').get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    template: (doc.data() as { templateCode?: string }).templateCode ?? '',
  }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  for (const collection of [
    'orders',
    'conversations',
    'conversationCheckoutSnapshots',
    'paymentIntents',
    'outboundMessages',
    'packages',
    'pickupStations',
    'deliveryZoneRules',
  ]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }

  packageId = await packageRepository.create(
    {
      businessId: BUSINESS_ID,
      name: 'Starter Box',
      description: 'A box',
      priceKes: 3500,
      isActive: true,
      imageUrl: null,
    },
    'test',
  );
  stationId = await pickupStationRepository.create(
    {
      businessId: BUSINESS_ID,
      courier: 'tushop',
      name: 'Fargo CBD',
      latitude: -1.2841,
      longitude: 36.8233,
      description: 'Moi Avenue',
      county: 'Nairobi',
      town: 'Nairobi',
      zone: 'Nairobi Metro — Next Day',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      deliveryFeeKes: 250,
      searchTokens: ['fargo', 'cbd'],
      isActive: true,
    },
    'test',
  );
  await deliveryZoneRuleRepository.upsertIfMissing({
    businessId: BUSINESS_ID,
    zone: 'Nairobi Metro — Next Day',
    shippingOrigin: 'Nairobi',
    packageCategory: 'small',
    courier: 'tushop',
    feeKes: 250,
  });

  /*
   * A real template, against the real emulator. Without one the send
   * fails before it writes anything, and "no dispatch text was sent"
   * would pass for a muted order and an ordinary one alike — the
   * assertions would prove nothing at all. The control case below is
   * what keeps this suite honest, so it has to be able to succeed.
   */
  await adminFirestore.recursiveDelete(adminFirestore.collection('notificationTemplates'));
  await notificationTemplateRepository.upsert({
    templateCode: 'order_dispatched_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: Your order {{orderRef}} has shipped and is on its way.',
    heading: null,
    ctaLabel: null,
    ctaUrl: null,
    htmlBodyTemplate: null,
    requiredParams: ['orderRef'],
    version: 1,
    isActive: true,
  });
});

function staffOrder(overrides: Record<string, unknown> = {}) {
  return {
    packageId,
    quantity: 1,
    customerName: 'Wanjiru Kamau',
    phone: '0712345678',
    county: 'Nairobi',
    deliveryMethod: 'pickup' as const,
    pickupStationId: stationId,
    initiatedBy: STAFF,
    manualPayment: { method: 'cash' as const, reference: null, note: null, recordedByUid: 'staff-1', recordedByName: 'Kelvin' },
    ...overrides,
  };
}

/** A service whose customer-facing sends are captured rather than posted. */
function spyingService() {
  const gateway = new FakeWhatsAppGateway();
  return { service: new ConversationService(gateway, gateway), gateway };
}

async function onlyOrder() {
  const snapshot = await adminFirestore.collection('orders').get();
  return { id: snapshot.docs[0].id, data: snapshot.docs[0].data() };
}

describe('an order recorded quietly', () => {
  it('sends the customer nothing at all', async () => {
    const { service, gateway } = spyingService();
    await service.startWebCheckout(BUSINESS_ID, staffOrder({ notifyCustomer: false }));

    const sent = await outbound();
    expect(sent.filter((message) => message.template.startsWith('order_'))).toEqual([]);
    expect(gateway.sent).toEqual([]);
  });

  /*
   * The message this switch was actually asked for. Unlike the
   * confirmation SMS — which an already-paid order never sent
   * automatically anyway — this one went to *every* staff order. It
   * opens "Payment received!" and goes on to promise a box that is
   * about to be curated and dispatched, which is nonsense about one
   * the customer already ate. Matched on the opening, which both the
   * pickup and door wordings share. Asserted against the control
   * below, so it cannot pass merely because nothing sends here.
   */
  it('does not tell the customer their order is on the way', async () => {
    const { service, gateway } = spyingService();
    await service.startWebCheckout(BUSINESS_ID, staffOrder({ notifyCustomer: false }));

    expect(gateway.sent.some((message) => /payment received/i.test(message.text))).toBe(false);
  });

  /*
   * The decision has to reach the order, or the dispatch text below
   * has nothing to read.
   */
  it('records the decision on the order itself', async () => {
    await conversationService.startWebCheckout(BUSINESS_ID, staffOrder({ notifyCustomer: false }));

    const order = await onlyOrder();
    expect(order.data.customerNotificationsMuted).toBe(true);
  });

  /*
   * The failure this replaces: muting the confirmation, then texting
   * "your order is on its way" about a box the customer already has —
   * the same confusion, arriving a day later.
   */
  it('stays quiet when the order is dispatched later', async () => {
    await conversationService.startWebCheckout(BUSINESS_ID, staffOrder({ notifyCustomer: false }));
    const order = await onlyOrder();

    await orderService.updateStatus(BUSINESS_ID, order.id, 'dispatched', 'staff-1');

    const sent = await outbound();
    expect(sent.some((message) => message.template === 'order_dispatched_sms')).toBe(false);
  });

  /* Muting the messages must not change the order itself in any way. */
  it('still moves the order through dispatched', async () => {
    await conversationService.startWebCheckout(BUSINESS_ID, staffOrder({ notifyCustomer: false }));
    const order = await onlyOrder();

    await orderService.updateStatus(BUSINESS_ID, order.id, 'dispatched', 'staff-1');

    const after = await orderRepository.findById(order.id);
    expect(after?.status).toBe('dispatched');
  });
});

describe('an ordinary staff order', () => {
  /*
   * The default, and the behaviour every order had before the switch
   * existed. An already-paid order has never sent the confirmation SMS
   * automatically — staff send that by hand — so what is asserted here
   * is the dispatch text, which it always got.
   */
  it('still gets the dispatch text', async () => {
    await conversationService.startWebCheckout(BUSINESS_ID, staffOrder());
    const order = await onlyOrder();

    expect(order.data.customerNotificationsMuted).toBeUndefined();

    await orderService.updateStatus(BUSINESS_ID, order.id, 'dispatched', 'staff-1');

    const sent = await outbound();
    expect(sent.some((message) => message.template === 'order_dispatched_sms')).toBe(true);
  });

  it('does tell the customer their order is confirmed', async () => {
    const { service, gateway } = spyingService();
    await service.startWebCheckout(BUSINESS_ID, staffOrder());

    expect(gateway.sent.some((message) => /payment received/i.test(message.text))).toBe(true);
  });

  it('is unaffected by notifyCustomer being explicitly true', async () => {
    await conversationService.startWebCheckout(BUSINESS_ID, staffOrder({ notifyCustomer: true }));

    const order = await onlyOrder();
    expect(order.data.customerNotificationsMuted).toBeUndefined();
  });
});

describe('a customer cannot silence their own order', () => {
  /*
   * The input backing this service also backs the public checkout
   * route. Without the `initiatedBy` gate, anybody could post
   * `notifyCustomer: false` and suppress the confirmation of their own
   * purchase — removing the one record they have that it happened.
   */
  it('ignores notifyCustomer on an order nobody staff-initiated', async () => {
    await conversationService.startWebCheckout(BUSINESS_ID, {
      packageId,
      quantity: 1,
      customerName: 'Wanjiru Kamau',
      phone: '0712345678',
      county: 'Nairobi',
      deliveryMethod: 'pickup',
      pickupStationId: stationId,
      notifyCustomer: false,
    });

    const snapshot = await adminFirestore.collection('conversationCheckoutSnapshots').get();
    expect(snapshot.docs[0].data().customerNotificationsMuted).toBeUndefined();
  });
});
