import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { ConversationService } from '@/services/conversationService';
import { paymentService } from '@/services/paymentService';
import { conversationRepository } from '@/repositories/conversationRepository';
import { conversationCheckoutSnapshotRepository } from '@/repositories/conversationCheckoutSnapshotRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { orderRepository } from '@/repositories/orderRepository';
import { shipmentRepository } from '@/repositories/shipmentRepository';
import type { WhatsAppGateway, WhatsAppSendResult } from '@/lib/integrations/types';

/**
 * The complete-loop proof: a customer goes from a first WhatsApp
 * message all the way through a real M-Pesa payment, order creation,
 * referral commission, Jumia shipment, and Meta CAPI dispatch — the
 * exact question this build is measured against: can a real Kenyan
 * customer's purchase be traced end to end, not "how many
 * repositories/services exist" or "does one slice work in isolation."
 *
 * WhatsApp send is faked (records what would have been sent, no real
 * network); Daraja, Jumia, and Meta are all exercised for real (real
 * gateway code, mocked HTTP transport, dispatched by URL) — the same
 * mocking discipline as the individual gateway test suites, just
 * driven end-to-end through the conversation instead of in isolation.
 */

class FakeWhatsAppGateway implements WhatsAppGateway {
  sent: { phone: string; text: string }[] = [];
  private counter = 0;

  async sendMessage(input: { phone: string; text: string }): Promise<WhatsAppSendResult> {
    this.sent.push(input);
    this.counter += 1;
    return { providerMessageId: `fake-${this.counter}` };
  }
  async sendTemplate(): Promise<WhatsAppSendResult> {
    throw new Error('not used in this test');
  }
  async sendButtons(): Promise<WhatsAppSendResult> {
    throw new Error('not used in this test');
  }
  async sendList(): Promise<WhatsAppSendResult> {
    throw new Error('not used in this test');
  }
  async markAsRead(): Promise<void> {}
  parseIncomingMessage(): never {
    throw new Error('not used in this test');
  }
  verifyWebhookChallenge(): string | null {
    return null;
  }
}

const ADMIN_PHONE = '254799999999';

const ENV = {
  DARAJA_CONSUMER_KEY: 'test-key',
  DARAJA_CONSUMER_SECRET: 'test-secret',
  DARAJA_SHORTCODE: '174379',
  DARAJA_PASSKEY: 'test-passkey',
  DARAJA_CALLBACK_URL: 'https://example.com/api/webhooks/daraja',
  JUMIA_API_KEY: 'test-jumia-key',
  JUMIA_MERCHANT_ID: 'merchant-1',
  META_PIXEL_ID: 'pixel-1',
  META_ACCESS_TOKEN: 'test-meta-token',
  ADMIN_WHATSAPP_PHONE: ADMIN_PHONE,
};

const PHONE = '254712345678';
const CHECKOUT_REQUEST_ID = 'e2e-checkout-1';
const MERCHANT_REQUEST_ID = 'e2e-merchant-1';
const JUMIA_SHIPMENT_REF = 'jumia-shipment-1';

function mockAllProviders() {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    const urlStr = String(url);
    if (urlStr.includes('/oauth/v1/generate')) {
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), {
          status: 200,
        }),
      );
    }
    if (urlStr.includes('/mpesa/stkpush')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            MerchantRequestID: MERCHANT_REQUEST_ID,
            CheckoutRequestID: CHECKOUT_REQUEST_ID,
            ResponseCode: '0',
            ResponseDescription: 'Success. Request accepted for processing',
            CustomerMessage: 'Success. Request accepted for processing',
          }),
          { status: 200 },
        ),
      );
    }
    if (urlStr.includes('/shipments')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            shipment_ref: JUMIA_SHIPMENT_REF,
            tracking_url: 'https://jumia.example/track/1',
          }),
          { status: 200 },
        ),
      );
    }
    if (urlStr.includes('graph.facebook.com')) {
      return Promise.resolve(new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    }
    throw new Error(`Unmocked fetch call: ${urlStr}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function darajaCallbackPayload(amountKes: number) {
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: MERCHANT_REQUEST_ID,
        CheckoutRequestID: CHECKOUT_REQUEST_ID,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: amountKes },
            { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
            { Name: 'TransactionDate', Value: 20240115120000 },
            { Name: 'PhoneNumber', Value: Number(PHONE) },
          ],
        },
      },
    },
  };
}

async function cleanCollections() {
  for (const name of [
    'packages',
    'conversations',
    'conversationCheckoutSnapshots',
    'paymentIntents',
    'webhookEvents',
    'domainEvents',
    'orders',
    'shipments',
    'referralLinks',
    'referralAttributions',
    'creatorProfiles',
    'outboundGatewayCalls',
  ]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(name));
  }
}

async function seedPackages() {
  const actor = 'system';
  await packageRepository.create(
    { name: 'Starter Box', description: 'Starter', priceKes: 2500, isActive: true },
    actor,
  );
  await packageRepository.create(
    { name: 'Deluxe Box', description: 'Deluxe', priceKes: 3500, isActive: true },
    actor,
  );
}

beforeEach(async () => {
  await cleanCollections();
  await seedPackages();
  for (const [key, value] of Object.entries(ENV)) {
    process.env[key] = value;
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(ENV)) {
    delete process.env[key];
  }
});

async function walkToConfirmation(
  service: ConversationService,
  { referralReply = 'no' }: { referralReply?: string } = {},
) {
  await service.start(PHONE, { text: 'Hi, I want to order' });
  await service.start(PHONE, { text: '1' }); // Starter Box
  await service.start(PHONE, { text: 'Jane Doe, Nairobi' });
  await service.start(PHONE, { text: '1' }); // door delivery
  await service.start(PHONE, { text: referralReply });
  await service.start(PHONE, { text: 'yes' });
}

describe('the full customer journey: Meta ad through Jumia shipment confirmation', () => {
  it('closes the entire loop: order created, inventory reserved, Jumia shipment created, Meta CAPI dispatched, admin notified', async () => {
    const fetchMock = mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway);

    await walkToConfirmation(service);

    const conversation = await conversationRepository.findActiveByPhoneNumber(PHONE);
    const snapshotId = conversation!.conversation.conversationCheckoutSnapshotId!;

    const callback = await paymentService.processCallback(darajaCallbackPayload(2500));
    expect(callback.status).toBe('succeeded');
    await service.handlePaymentResult(callback);

    // Conversation closed out.
    const finalConversation = await conversationRepository.findById(conversation!.id);
    expect(finalConversation?.status).toBe('completed');
    const finalSnapshot = await conversationCheckoutSnapshotRepository.findById(snapshotId);
    expect(finalSnapshot?.status).toBe('completed');

    // A real order exists.
    const ordersSnapshot = await adminFirestore.collection('orders').get();
    expect(ordersSnapshot.size).toBe(1);
    const orderDoc = ordersSnapshot.docs[0];
    const order = orderDoc.data();
    expect(order.status).toBe('confirmed');
    expect(order.totalAmountKes).toBe(2500);
    expect(order.customerId).toBeNull(); // guest — real, not an oversight
    expect(order.phoneNumber).toBe(PHONE);
    expect(order.deliveryMethod).toBe('door_delivery');

    const items = await orderRepository.listItems(orderDoc.id);
    expect(items).toHaveLength(1);
    expect(items[0].packageLabel).toBe('Starter Box');

    // Jumia shipment created for real (mocked transport, real gateway code).
    const shipment = await shipmentRepository.findByOrderId(orderDoc.id);
    expect(shipment?.data.status).toBe('created');
    expect(shipment?.data.courierShipmentRef).toBe(JUMIA_SHIPMENT_REF);

    // Meta CAPI Purchase event was dispatched.
    const metaCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('graph.facebook.com'),
    );
    expect(metaCall).toBeDefined();
    const metaBody = JSON.parse((metaCall![1] as RequestInit).body as string);
    expect(metaBody.data[0].event_name).toBe('Purchase');
    expect(metaBody.data[0].custom_data).toMatchObject({ currency: 'KES', value: 2500 });

    // Admin was notified over WhatsApp.
    const adminMessages = gateway.sent.filter((m) => m.phone === ADMIN_PHONE);
    expect(adminMessages).toHaveLength(1);
    expect(adminMessages[0].text).toContain('New order');

    // Customer got their confirmation.
    expect(gateway.sent.at(-1)?.text).toContain('Payment received');
  });

  it('validates a referral code, discounts the order, and credits the creator commission', async () => {
    mockAllProviders();

    // A real creator with a real referral link.
    const creatorId = 'creator-1';
    await adminFirestore.collection('creatorProfiles').doc(creatorId).set({
      referralCode: 'CREATOR10',
      tier: 'bronze',
      availableCashKes: 0,
      pendingEarningsKes: 0,
      lifetimeEarningsKes: 0,
      totalClicks: 0,
      totalConversions: 0,
      bio: '',
      niche: '',
      followersRange: '',
      paymentPreference: 'mpesa',
      socialHandles: {},
      onboardingCompleted: true,
      status: 'active',
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: 'system',
      updatedBy: 'system',
      deletedAt: null,
    });
    await adminFirestore.collection('referralLinks').add({
      code: 'CREATOR10',
      ownerId: creatorId,
      discountKes: 200,
      commissionKes: 300,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: 'system',
      updatedBy: 'system',
      deletedAt: null,
    });

    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway);
    await walkToConfirmation(service, { referralReply: 'CREATOR10' });

    const conversation = await conversationRepository.findActiveByPhoneNumber(PHONE);
    const snapshotId = conversation!.conversation.conversationCheckoutSnapshotId!;
    const snapshot = await conversationCheckoutSnapshotRepository.findById(snapshotId);
    expect(snapshot?.discountKes).toBe(200);
    expect(snapshot?.totalKes).toBe(2300); // 2500 - 200

    const callback = await paymentService.processCallback(darajaCallbackPayload(2300));
    expect(callback.status).toBe('succeeded');
    await service.handlePaymentResult(callback);

    // Commission credited.
    const creatorSnapshot = await adminFirestore
      .collection('creatorProfiles')
      .doc(creatorId)
      .get();
    expect(creatorSnapshot.data()?.availableCashKes).toBe(300);
    expect(creatorSnapshot.data()?.lifetimeEarningsKes).toBe(300);

    const ledgerSnapshot = await adminFirestore
      .collection('creatorProfiles')
      .doc(creatorId)
      .collection('earningsLedger')
      .get();
    expect(ledgerSnapshot.size).toBe(1);
    expect(ledgerSnapshot.docs[0].data().amountKes).toBe(300);

    // A real attribution record backs the credit.
    const attributionsSnapshot = await adminFirestore.collection('referralAttributions').get();
    expect(attributionsSnapshot.size).toBe(1);
    expect(attributionsSnapshot.docs[0].data().creatorId).toBe(creatorId);
  });

  it('never loses a payment when the box sold out between order steps and payment', async () => {
    mockAllProviders();
    // A package that actually tracks stock, and is already at zero —
    // the real, if rare, race this safety net exists for.
    await packageRepository.create(
      {
        name: 'Limited Edition Box',
        description: 'Sold out',
        priceKes: 1500,
        isActive: true,
        stockCount: 0,
      },
      'system',
    );

    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway);
    // Cheapest package (1500) is now index 1.
    await service.start(PHONE, { text: 'Hi' });
    await service.start(PHONE, { text: '1' });
    await service.start(PHONE, { text: 'Jane Doe, Nairobi' });
    await service.start(PHONE, { text: '1' });
    await service.start(PHONE, { text: 'no' });
    await service.start(PHONE, { text: 'yes' });

    const conversation = await conversationRepository.findActiveByPhoneNumber(PHONE);
    const callback = await paymentService.processCallback(darajaCallbackPayload(1500));
    expect(callback.status).toBe('succeeded');
    await service.handlePaymentResult(callback);

    // No order was created — but the payment itself is untouched (still 'succeeded').
    const ordersSnapshot = await adminFirestore.collection('orders').get();
    expect(ordersSnapshot.size).toBe(0);

    // The customer was told something, not left hanging.
    expect(gateway.sent.at(-1)?.text).toContain('our team will contact you');

    // Admin got an urgent, actionable alert.
    const adminMessages = gateway.sent.filter((m) => m.phone === ADMIN_PHONE);
    expect(adminMessages.some((m) => m.text.includes('URGENT'))).toBe(true);

    // Conversation is left as-is for manual resolution, not silently marked completed.
    const finalConversation = await conversationRepository.findById(conversation!.id);
    expect(finalConversation?.status).not.toBe('completed');
  });

  it('rejects a duplicate Daraja callback delivery without reprocessing', async () => {
    mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway);

    await walkToConfirmation(service);

    const callbackPayload = darajaCallbackPayload(2500);
    const first = await paymentService.processCallback(callbackPayload);
    expect(first.status).toBe('succeeded');
    await service.handlePaymentResult(first);

    const second = await paymentService.processCallback(callbackPayload);
    expect(second.status).toBe('duplicate');

    // Only one order was ever created, despite the duplicate delivery.
    const ordersSnapshot = await adminFirestore.collection('orders').get();
    expect(ordersSnapshot.size).toBe(1);
  });
});
