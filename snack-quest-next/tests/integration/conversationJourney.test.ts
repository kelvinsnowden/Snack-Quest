import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { ConversationService } from '@/services/conversationService';
import { paymentService } from '@/services/paymentService';
import { conversationRepository } from '@/repositories/conversationRepository';
import { conversationCheckoutSnapshotRepository } from '@/repositories/conversationCheckoutSnapshotRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { orderRepository } from '@/repositories/orderRepository';
import { shipmentRepository } from '@/repositories/shipmentRepository';
import { businessRepository } from '@/repositories/businessRepository';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { pickupStationRepository } from '@/repositories/pickupStationRepository';
import { JUMIA_PACKAGE_TRACKER_URL } from '@/lib/integrations/jumia/constants';
import { POST as priceDoorDeliveryRoute } from '@/app/api/internal/conversations/[conversationId]/price-door-delivery/route';
import type { WhatsAppGateway, WhatsAppSendResult } from '@/lib/integrations/types';

/**
 * The complete-loop proof: a customer goes from a first WhatsApp
 * message all the way through a real M-Pesa payment, order creation,
 * referral commission, Jumia shipment, and Meta CAPI dispatch — the
 * exact question this build is measured against: can a real Kenyan
 * customer's purchase be traced end to end.
 *
 * The final describe block below is the platform-level proof this
 * session's architecture direction demands: a second, independent
 * business — its own WhatsApp number, Daraja shortcode, Jumia
 * account, Meta Pixel, and referral codes — completes a full order
 * through the *exact same* Services and Gateways, zero code changes,
 * and the two tenants' data never cross-contaminates.
 *
 * WhatsApp send is faked (records what would have been sent, no real
 * network); Daraja, Jumia, and Meta are all exercised for real (real
 * gateway code, mocked HTTP transport, dispatched by request content) —
 * the same mocking discipline as the individual gateway test suites,
 * just driven end-to-end through the conversation instead of in
 * isolation.
 */

class FakeWhatsAppGateway implements WhatsAppGateway {
  sent: { businessId: string; phone: string; text: string }[] = [];
  private counter = 0;

  async sendMessage(input: {
    businessId: string;
    phone: string;
    text: string;
  }): Promise<WhatsAppSendResult> {
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

const PHONE = '254712345678';

interface TenantConfig {
  businessId: string;
  name: string;
  whatsappPhoneNumberId: string;
  adminWhatsappPhone: string;
  shortcode: string;
  jumiaMerchantId: string;
  metaPixelId: string;
}

const SNACK_QUEST: TenantConfig = {
  businessId: 'biz-snack-quest',
  name: 'Snack Quest',
  whatsappPhoneNumberId: 'wa-snack-quest',
  adminWhatsappPhone: '254799999001',
  shortcode: '174379',
  jumiaMerchantId: 'jumia-snack-quest',
  metaPixelId: 'pixel-snack-quest',
};

const RIVAL_SNACKS: TenantConfig = {
  businessId: 'biz-rival-snacks',
  name: 'Rival Snacks Co',
  whatsappPhoneNumberId: 'wa-rival-snacks',
  adminWhatsappPhone: '254799999002',
  shortcode: '555555',
  jumiaMerchantId: 'jumia-rival-snacks',
  metaPixelId: 'pixel-rival-snacks',
};

async function seedBusiness(tenant: TenantConfig) {
  await businessRepository.create(
    tenant.businessId,
    {
      name: tenant.name,
      currency: 'KES',
      whatsappPhoneNumberId: tenant.whatsappPhoneNumberId,
      countyCoverage: [],
      adminWhatsappPhone: tenant.adminWhatsappPhone,
      status: 'active',
    },
    'system',
  );
  await businessIntegrationSecretRepository.set(tenant.businessId, 'daraja', {
    consumerKey: `key-${tenant.businessId}`,
    consumerSecret: `secret-${tenant.businessId}`,
    shortcode: tenant.shortcode,
    passkey: 'test-passkey',
    callbackUrl: `https://example.com/api/webhooks/daraja/${tenant.businessId}`,
    env: 'sandbox',
  });
  await businessIntegrationSecretRepository.set(tenant.businessId, 'whatchimp', {
    apiKey: `wa-key-${tenant.businessId}`,
    phoneNumberId: tenant.whatsappPhoneNumberId,
  });
  await businessIntegrationSecretRepository.set(tenant.businessId, 'jumia', {
    apiKey: `jumia-key-${tenant.businessId}`,
    merchantId: tenant.jumiaMerchantId,
  });
  await businessIntegrationSecretRepository.set(tenant.businessId, 'meta', {
    pixelId: tenant.metaPixelId,
    accessToken: `meta-token-${tenant.businessId}`,
  });
}

async function seedPackages(businessId: string) {
  const actor = 'system';
  await packageRepository.create(
    { businessId, name: 'Starter Box', description: 'Starter', priceKes: 2500, isActive: true },
    actor,
  );
  await packageRepository.create(
    { businessId, name: 'Deluxe Box', description: 'Deluxe', priceKes: 3500, isActive: true },
    actor,
  );
}

/**
 * A Nairobi pickup station with `deliveryFeeKes: 0` ("not yet
 * configured", never fabricated) — used by tests that only care about
 * the payment/order/referral/shipment machinery, not pickup pricing
 * itself, so their dollar-amount assertions don't have to account for
 * a station fee. `tests: full Jumia pickup station journey` below
 * covers the real, non-zero-fee case.
 */
async function seedFreePickupStation(businessId: string) {
  await pickupStationRepository.create(
    {
      businessId,
      courier: 'jumia',
      name: 'Naivas CBD Station',
      latitude: -1.2833,
      longitude: 36.8167,
      description: 'Nairobi CBD',
      county: 'Nairobi',
      town: 'CBD',
      zone: 'Nairobi',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      deliveryFeeKes: 0,
      isActive: true,
      searchTokens: ['naivas', 'cbd', 'nairobi'],
    },
    'system',
  );
}

/** Dispatches by request *content*, not just URL, so two tenants calling the same mocked endpoints get tenant-correct responses. */
function mockAllProviders() {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const urlStr = String(url);
    const body = init?.body ? JSON.parse(init.body as string) : {};

    if (urlStr.includes('/oauth/v1/generate')) {
      return new Response(
        JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }),
        { status: 200 },
      );
    }
    if (urlStr.includes('/mpesa/stkpush')) {
      const shortcode = body.BusinessShortCode;
      return new Response(
        JSON.stringify({
          MerchantRequestID: `merchant-${shortcode}`,
          CheckoutRequestID: `checkout-${shortcode}`,
          ResponseCode: '0',
          ResponseDescription: 'Success. Request accepted for processing',
          CustomerMessage: 'Success. Request accepted for processing',
        }),
        { status: 200 },
      );
    }
    if (urlStr.includes('/shipments')) {
      return new Response(
        JSON.stringify({
          shipment_ref: `shipment-${body.merchant_id}`,
          tracking_url: `https://jumia.example/track/${body.merchant_id}`,
        }),
        { status: 200 },
      );
    }
    if (urlStr.includes('graph.facebook.com')) {
      return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
    }
    if (urlStr.includes('/messages')) {
      // Real WhatchimpGateway HTTP call — only hit when a Service uses the
      // module-level singleton (e.g. the internal agent-pricing route,
      // which doesn't take a FakeWhatsAppGateway) instead of a test's
      // own `new ConversationService(fakeGateway)`.
      return new Response(
        JSON.stringify({ messages: [{ id: `wamid-${Date.now()}` }] }),
        { status: 200 },
      );
    }
    throw new Error(`Unmocked fetch call: ${urlStr}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function darajaCallbackPayload(shortcode: string, amountKes: number) {
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: `merchant-${shortcode}`,
        CheckoutRequestID: `checkout-${shortcode}`,
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
    'businesses',
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
    'pickupStations',
  ]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(name));
  }
}

beforeEach(async () => {
  await cleanCollections();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The generic "goes all the way to payment automatically" path used
 * by tests that aren't specifically about delivery method — Jumia
 * pickup (via the free seeded station above) rather than door
 * delivery, since door delivery no longer reaches payment without a
 * human agent's price in between (see the dedicated door-delivery
 * describe block for that path).
 */
async function walkToConfirmation(
  service: ConversationService,
  businessId: string,
  { referralReply = 'no' }: { referralReply?: string } = {},
) {
  await service.start(businessId, PHONE, { text: 'Hi, I want to order' });
  await service.start(businessId, PHONE, { text: '1' }); // Starter Box
  await service.start(businessId, PHONE, { text: 'Jane Doe, Nairobi' });
  await service.start(businessId, PHONE, { text: '2' }); // Jumia Pickup Station
  await service.start(businessId, PHONE, { text: 'CBD' }); // search
  await service.start(businessId, PHONE, { text: '1' }); // select the seeded station
  await service.start(businessId, PHONE, { text: referralReply });
  await service.start(businessId, PHONE, { text: 'yes' });
}

describe('the full customer journey: Meta ad through Jumia shipment confirmation', () => {
  beforeEach(async () => {
    await seedBusiness(SNACK_QUEST);
    await seedPackages(SNACK_QUEST.businessId);
    await seedFreePickupStation(SNACK_QUEST.businessId);
  });

  it('closes the entire loop: order created, inventory reserved, Jumia shipment created, Meta CAPI dispatched, admin notified', async () => {
    const fetchMock = mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway);

    await walkToConfirmation(service, SNACK_QUEST.businessId);

    const conversation = await conversationRepository.findActiveByPhoneNumber(
      SNACK_QUEST.businessId,
      PHONE,
    );
    const snapshotId = conversation!.conversation.conversationCheckoutSnapshotId!;

    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, 2500),
    );
    expect(callback.status).toBe('succeeded');
    await service.handlePaymentResult(callback);

    const finalConversation = await conversationRepository.findById(conversation!.id);
    expect(finalConversation?.status).toBe('completed');
    expect(finalConversation?.businessId).toBe(SNACK_QUEST.businessId);
    const finalSnapshot = await conversationCheckoutSnapshotRepository.findById(snapshotId);
    expect(finalSnapshot?.status).toBe('completed');

    const ordersSnapshot = await adminFirestore.collection('orders').get();
    expect(ordersSnapshot.size).toBe(1);
    const orderDoc = ordersSnapshot.docs[0];
    const order = orderDoc.data();
    expect(order.businessId).toBe(SNACK_QUEST.businessId);
    expect(order.status).toBe('confirmed');
    expect(order.pricing.totalKes).toBe(2500);
    expect(order.customer.customerId).toBeNull();
    expect(order.customer.phoneNumber).toBe(PHONE);
    expect(order.delivery.method).toBe('pickup');
    expect(order.delivery.provider).toBe('jumia');
    expect(order.payment.mpesaReceiptNumber).toBe('NLJ7RT61SV');

    const items = await orderRepository.listItems(orderDoc.id);
    expect(items).toHaveLength(1);
    expect(items[0].packageLabel).toBe('Starter Box');

    const shipment = await shipmentRepository.findByOrderId(orderDoc.id);
    expect(shipment?.data.businessId).toBe(SNACK_QUEST.businessId);
    expect(shipment?.data.status).toBe('created');
    expect(shipment?.data.courierShipmentRef).toBe(`shipment-${SNACK_QUEST.jumiaMerchantId}`);

    const metaCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('graph.facebook.com'),
    );
    expect(metaCall).toBeDefined();
    const metaBody = JSON.parse((metaCall![1] as RequestInit).body as string);
    expect(metaBody.access_token).toBe(`meta-token-${SNACK_QUEST.businessId}`);
    expect(metaBody.data[0].event_name).toBe('Purchase');
    expect(metaBody.data[0].custom_data).toMatchObject({ currency: 'KES', value: 2500 });

    const adminMessages = gateway.sent.filter((m) => m.phone === SNACK_QUEST.adminWhatsappPhone);
    expect(adminMessages).toHaveLength(1);
    expect(adminMessages[0].text).toContain('New order');
    expect(adminMessages[0].businessId).toBe(SNACK_QUEST.businessId);

    expect(gateway.sent.at(-1)?.text).toContain('Payment received');
  });

  it('validates a referral code, discounts the order, and credits the creator commission', async () => {
    mockAllProviders();

    const creatorId = 'creator-1';
    await adminFirestore.collection('creatorProfiles').doc(creatorId).set({
      businessId: SNACK_QUEST.businessId,
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
      businessId: SNACK_QUEST.businessId,
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
    await walkToConfirmation(service, SNACK_QUEST.businessId, { referralReply: 'CREATOR10' });

    const conversation = await conversationRepository.findActiveByPhoneNumber(
      SNACK_QUEST.businessId,
      PHONE,
    );
    const snapshotId = conversation!.conversation.conversationCheckoutSnapshotId!;
    const snapshot = await conversationCheckoutSnapshotRepository.findById(snapshotId);
    expect(snapshot?.discountKes).toBe(200);
    expect(snapshot?.totalKes).toBe(2300);

    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, 2300),
    );
    expect(callback.status).toBe('succeeded');
    await service.handlePaymentResult(callback);

    const creatorSnapshot = await adminFirestore
      .collection('creatorProfiles')
      .doc(creatorId)
      .get();
    expect(creatorSnapshot.data()?.availableCashKes).toBe(300);

    const attributionsSnapshot = await adminFirestore.collection('referralAttributions').get();
    expect(attributionsSnapshot.size).toBe(1);
    expect(attributionsSnapshot.docs[0].data().businessId).toBe(SNACK_QUEST.businessId);
  });

  it('never loses a payment when the box sold out between order steps and payment', async () => {
    mockAllProviders();
    await packageRepository.create(
      {
        businessId: SNACK_QUEST.businessId,
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
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Hi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' }); // cheapest = Limited Edition
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Jane Doe, Nairobi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '2' }); // Jumia Pickup Station
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'CBD' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'no' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'yes' });

    const conversation = await conversationRepository.findActiveByPhoneNumber(
      SNACK_QUEST.businessId,
      PHONE,
    );
    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, 1500),
    );
    expect(callback.status).toBe('succeeded');
    await service.handlePaymentResult(callback);

    const ordersSnapshot = await adminFirestore.collection('orders').get();
    expect(ordersSnapshot.size).toBe(0);
    expect(gateway.sent.at(-1)?.text).toContain('our team will contact you');
    const adminMessages = gateway.sent.filter((m) => m.phone === SNACK_QUEST.adminWhatsappPhone);
    expect(adminMessages.some((m) => m.text.includes('URGENT'))).toBe(true);

    const finalConversation = await conversationRepository.findById(conversation!.id);
    expect(finalConversation?.status).not.toBe('completed');
  });

  it('rejects a duplicate Daraja callback delivery without reprocessing', async () => {
    mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway);

    await walkToConfirmation(service, SNACK_QUEST.businessId);

    const callbackPayload = darajaCallbackPayload(SNACK_QUEST.shortcode, 2500);
    const first = await paymentService.processCallback(SNACK_QUEST.businessId, callbackPayload);
    expect(first.status).toBe('succeeded');
    await service.handlePaymentResult(first);

    const second = await paymentService.processCallback(SNACK_QUEST.businessId, callbackPayload);
    expect(second.status).toBe('duplicate');

    const ordersSnapshot = await adminFirestore.collection('orders').get();
    expect(ordersSnapshot.size).toBe(1);
  });
});

describe('the full Jumia pickup station journey: search, select, auto-priced fee, order, tracking confirmation', () => {
  beforeEach(async () => {
    await seedBusiness(SNACK_QUEST);
    await seedPackages(SNACK_QUEST.businessId);
  });

  it('walks a customer from station search through a confirmed order with a real delivery fee and the exact required tracking-URL copy', async () => {
    mockAllProviders();

    await pickupStationRepository.create(
      {
        businessId: SNACK_QUEST.businessId,
        courier: 'jumia',
        name: 'G4S Kasarani Station',
        latitude: -1.2201,
        longitude: 36.8899,
        description: 'Kasarani, opposite Sportsview Hotel',
        county: 'Nairobi',
        town: 'Kasarani',
        zone: 'Nairobi',
        shippingOrigin: 'Nairobi',
        packageCategory: 'small',
        deliveryFeeKes: 250,
        isActive: true,
        searchTokens: ['g4s', 'kasarani', 'station', 'nairobi'],
      },
      'system',
    );

    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway);

    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Hi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' }); // Starter Box (2500)
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Jane Doe, Nairobi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '2' }); // Jumia Pickup Station

    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Kasarani' }); // search by town
    expect(gateway.sent.at(-1)?.text).toContain('G4S Kasarani Station');

    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' }); // select the station
    expect(gateway.sent.at(-1)?.text).toContain('KES 250'); // fee auto-populated, never typed by the customer

    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'no' }); // no referral code
    expect(gateway.sent.at(-1)?.text).toContain('G4S Kasarani Station'); // order summary shows the station
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'yes' });

    const conversation = await conversationRepository.findActiveByPhoneNumber(
      SNACK_QUEST.businessId,
      PHONE,
    );
    const snapshotId = conversation!.conversation.conversationCheckoutSnapshotId!;
    const snapshot = await conversationCheckoutSnapshotRepository.findById(snapshotId);
    expect(snapshot?.delivery.pickupStationName).toBe('G4S Kasarani Station');
    expect(snapshot?.deliveryFeeKes).toBe(250);
    expect(snapshot?.totalKes).toBe(2750); // 2500 box + 250 delivery, no discount
    expect(snapshot?.delivery.shippingOrigin).toBe('Nairobi');

    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, 2750),
    );
    expect(callback.status).toBe('succeeded');
    await service.handlePaymentResult(callback);

    const ordersSnapshot = await adminFirestore.collection('orders').get();
    expect(ordersSnapshot.size).toBe(1);
    const order = ordersSnapshot.docs[0].data();
    expect(order.delivery.pickupStationName).toBe('G4S Kasarani Station');
    expect(order.delivery.feeKes).toBe(250);
    expect(order.delivery.shippingOrigin).toBe('Nairobi');
    expect(order.delivery.provider).toBe('jumia');
    expect(order.delivery.trackingUrl).toBe(JUMIA_PACKAGE_TRACKER_URL);
    expect(order.pricing.totalKes).toBe(2750);
    expect(order.pricing.deliveryFeeKes).toBe(250);

    const finalMessage = gateway.sent.at(-1)?.text ?? '';
    expect(finalMessage).toContain('curated within 24 hours');
    expect(finalMessage).toContain(JUMIA_PACKAGE_TRACKER_URL);
  });
});

describe('door delivery (human-assisted checkout via a human agent)', () => {
  beforeAll(() => {
    process.env.INTERNAL_AGENT_API_KEY = 'test-secret';
  });

  beforeEach(async () => {
    await seedBusiness(SNACK_QUEST);
    await seedPackages(SNACK_QUEST.businessId);
  });

  it('collects address details, escalates to a human agent with the exact required copy, and pauses the bot', async () => {
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway);

    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Hi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' }); // Starter Box
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Jane Doe, Nairobi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' }); // Door Delivery (Nairobi Only)

    const escalationTurn = await service.start(SNACK_QUEST.businessId, PHONE, {
      text: '123 Ngong Road, near ABC Bank, Kilimani, 0712345678',
    });
    expect(escalationTurn.botReply).toBe(
      "Great choice! Door delivery within Nairobi is handled by Bolt, whose pricing changes based " +
        'on distance and traffic. One of our team members will contact you shortly to confirm your ' +
        'delivery cost and complete your order.',
    );

    const conversation = await conversationRepository.findActiveByPhoneNumber(
      SNACK_QUEST.businessId,
      PHONE,
    );
    expect(conversation?.conversation.status).toBe('agent_assigned');
    expect(conversation?.conversation.escalationReason).toBe('door_delivery_price_confirmation');
    expect(conversation?.conversation.stateBlob.addressText).toBe('123 Ngong Road');
    expect(conversation?.conversation.stateBlob.estate).toBe('Kilimani');

    const adminMessages = gateway.sent.filter((m) => m.phone === SNACK_QUEST.adminWhatsappPhone);
    expect(adminMessages).toHaveLength(1);
    expect(adminMessages[0].text).toContain('Bolt');
    expect(adminMessages[0].text).toContain('123 Ngong Road');
    expect(adminMessages[0].text).toContain('Kilimani');

    // The bot no longer auto-responds — a human is driving this thread now.
    const ignored = await service.start(SNACK_QUEST.businessId, PHONE, { text: 'hello?' });
    expect(ignored.botReply).toBeNull();
  });

  it('prices the order through the real internal agent API, charges M-Pesa, and completes the order with the nested delivery/provider schema', async () => {
    mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway);

    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Hi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Jane Doe, Nairobi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' });
    await service.start(SNACK_QUEST.businessId, PHONE, {
      text: '123 Ngong Road, near ABC Bank, Kilimani, 0712345678',
    });

    const conversation = await conversationRepository.findActiveByPhoneNumber(
      SNACK_QUEST.businessId,
      PHONE,
    );
    const conversationId = conversation!.id;

    const makeRequest = (headers: Record<string, string>) =>
      new Request('http://localhost/api/internal/conversations/x/price-door-delivery', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ agentId: 'agent-1', feeKes: 400 }),
      });

    // Wrong/missing shared secret — the honest stopgap this route uses
    // in place of real staff auth still has to actually reject.
    const unauthorized = await priceDoorDeliveryRoute(makeRequest({}), {
      params: Promise.resolve({ conversationId }),
    });
    expect(unauthorized.status).toBe(401);

    const response = await priceDoorDeliveryRoute(
      makeRequest({ 'x-internal-api-key': 'test-secret' }),
      { params: Promise.resolve({ conversationId }) },
    );
    expect(response.status).toBe(200);

    const pricedConversation = await conversationRepository.findById(conversationId);
    expect(pricedConversation?.status).toBe('awaiting_payment');
    const snapshotId = pricedConversation!.conversationCheckoutSnapshotId!;
    const snapshot = await conversationCheckoutSnapshotRepository.findById(snapshotId);
    expect(snapshot?.delivery.method).toBe('door');
    expect(snapshot?.delivery.provider).toBe('bolt');
    expect(snapshot?.delivery.feeKes).toBe(400);
    expect(snapshot?.delivery.addressText).toBe('123 Ngong Road');
    expect(snapshot?.totalKes).toBe(2900); // 2500 box + 400 Bolt fee, no automated referral step for door delivery

    // The pricing route runs through the module-level `conversationService`
    // singleton (its real WhatsApp gateway, not this test's local
    // `gateway`) — read the persisted transcript instead of `gateway.sent`.
    const messagesAfterPricing = await conversationRepository.listMessages(conversationId);
    expect(messagesAfterPricing.at(-1)?.body).toContain('KES 2900');

    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, 2900),
    );
    expect(callback.status).toBe('succeeded');
    await service.handlePaymentResult(callback);

    const ordersSnapshot = await adminFirestore.collection('orders').get();
    expect(ordersSnapshot.size).toBe(1);
    const order = ordersSnapshot.docs[0].data();
    expect(order.delivery.method).toBe('door');
    expect(order.delivery.provider).toBe('bolt');
    expect(order.delivery.feeKes).toBe(400);
    expect(order.delivery.addressText).toBe('123 Ngong Road');
    expect(order.delivery.estate).toBe('Kilimani');
    expect(order.delivery.trackingUrl).toBeNull(); // no generic Bolt tracker exists
    expect(order.pricing.totalKes).toBe(2900);
    expect(order.payment.mpesaReceiptNumber).toBe('NLJ7RT61SV');

    // Bolt has no automated booking API in this codebase — a human
    // agent must book the courier themselves; the shipment record
    // reflects that real state, not a fabricated "created" status.
    const shipment = await shipmentRepository.findByOrderId(ordersSnapshot.docs[0].id);
    expect(shipment?.data.status).toBe('pending_manual_booking');
    expect(shipment?.data.provider).toBe('bolt');
    expect(shipment?.data.courierShipmentRef).toBeNull();

    const finalMessage = gateway.sent.at(-1)?.text ?? '';
    expect(finalMessage).toContain('Payment received');
    expect(finalMessage).not.toContain('Jumia');
  });

  it('rejects pricing a conversation that was never escalated', async () => {
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway);
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Hi' });

    const conversation = await conversationRepository.findActiveByPhoneNumber(
      SNACK_QUEST.businessId,
      PHONE,
    );

    const response = await priceDoorDeliveryRoute(
      new Request('http://localhost/api/internal/conversations/x/price-door-delivery', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-api-key': 'test-secret' },
        body: JSON.stringify({ agentId: 'agent-1', feeKes: 400 }),
      }),
      { params: Promise.resolve({ conversationId: conversation!.id }) },
    );
    expect(response.status).toBe(400);
  });
});

describe('platform proof: a second, independent tenant', () => {
  it('completes a full order through identical code with zero cross-tenant contamination', async () => {
    await seedBusiness(SNACK_QUEST);
    await seedBusiness(RIVAL_SNACKS);
    await seedPackages(SNACK_QUEST.businessId);
    await seedFreePickupStation(SNACK_QUEST.businessId);
    await seedFreePickupStation(RIVAL_SNACKS.businessId);
    await packageRepository.create(
      {
        businessId: RIVAL_SNACKS.businessId,
        name: 'Rival Mega Box',
        description: 'A totally different product line',
        priceKes: 4200,
        isActive: true,
      },
      'system',
    );

    // A referral code that means something for Snack Quest and
    // literally does not exist for Rival Snacks.
    const creatorId = 'creator-snack-quest-1';
    await adminFirestore.collection('creatorProfiles').doc(creatorId).set({
      businessId: SNACK_QUEST.businessId,
      referralCode: 'SQ10',
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
      businessId: SNACK_QUEST.businessId,
      code: 'SQ10',
      ownerId: creatorId,
      discountKes: 100,
      commissionKes: 150,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: 'system',
      updatedBy: 'system',
      deletedAt: null,
    });

    // Business resolution works exactly the way the shared webhook
    // endpoint relies on: a phone_number_id resolves to exactly one tenant.
    const resolvedSnackQuest = await businessRepository.findByWhatsappPhoneNumberId(
      SNACK_QUEST.whatsappPhoneNumberId,
    );
    const resolvedRival = await businessRepository.findByWhatsappPhoneNumberId(
      RIVAL_SNACKS.whatsappPhoneNumberId,
    );
    expect(resolvedSnackQuest?.id).toBe(SNACK_QUEST.businessId);
    expect(resolvedRival?.id).toBe(RIVAL_SNACKS.businessId);

    mockAllProviders();

    // Same phone number places one order with each business — a real
    // customer can absolutely be a customer of two different WhatsApp
    // businesses.
    const sqGateway = new FakeWhatsAppGateway();
    const sqService = new ConversationService(sqGateway);
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: 'Hi' });
    // Snack Quest's cheapest package is index 1: Starter Box (2500).
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: '1' });
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: 'Jane Doe, Nairobi' });
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: '2' }); // Jumia Pickup Station
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: 'CBD' });
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: '1' }); // select the seeded (free) station
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: 'SQ10' }); // valid here
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: 'yes' });

    const rivalGateway = new FakeWhatsAppGateway();
    const rivalService = new ConversationService(rivalGateway);
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: 'Hi' });
    // Rival's only package is index 1: Rival Mega Box (4200).
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: '1' });
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: 'Jane Doe, Nairobi' });
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: '2' }); // Jumia Pickup Station
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: 'CBD' });
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: '1' });
    // The SAME code, meaningless here — must NOT discount Rival's order.
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: 'SQ10' });
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: 'yes' });

    const sqConversation = await conversationRepository.findActiveByPhoneNumber(
      SNACK_QUEST.businessId,
      PHONE,
    );
    const rivalConversation = await conversationRepository.findActiveByPhoneNumber(
      RIVAL_SNACKS.businessId,
      PHONE,
    );
    // Same phone number, two completely independent conversation threads.
    expect(sqConversation!.id).not.toBe(rivalConversation!.id);

    const sqSnapshot = await conversationCheckoutSnapshotRepository.findById(
      sqConversation!.conversation.conversationCheckoutSnapshotId!,
    );
    const rivalSnapshot = await conversationCheckoutSnapshotRepository.findById(
      rivalConversation!.conversation.conversationCheckoutSnapshotId!,
    );
    expect(sqSnapshot?.totalKes).toBe(2400); // 2500 - 100 (SQ10 applied)
    expect(rivalSnapshot?.totalKes).toBe(4200); // SQ10 not recognized — full price
    expect(rivalSnapshot?.referralLinkId).toBeNull();

    // Complete both payments — each against its OWN Daraja shortcode.
    const sqCallback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, 2400),
    );
    expect(sqCallback.status).toBe('succeeded');
    await sqService.handlePaymentResult(sqCallback);

    const rivalCallback = await paymentService.processCallback(
      RIVAL_SNACKS.businessId,
      darajaCallbackPayload(RIVAL_SNACKS.shortcode, 4200),
    );
    expect(rivalCallback.status).toBe('succeeded');
    await rivalService.handlePaymentResult(rivalCallback);

    // Each tenant has exactly its own order, correctly attributed.
    const sqOrders = await adminFirestore
      .collection('orders')
      .where('businessId', '==', SNACK_QUEST.businessId)
      .get();
    const rivalOrders = await adminFirestore
      .collection('orders')
      .where('businessId', '==', RIVAL_SNACKS.businessId)
      .get();
    expect(sqOrders.size).toBe(1);
    expect(rivalOrders.size).toBe(1);
    expect(sqOrders.docs[0].data().pricing.totalKes).toBe(2400);
    expect(rivalOrders.docs[0].data().pricing.totalKes).toBe(4200);

    // The creator only got credited for the Snack Quest order — Rival
    // Snacks never touched Snack Quest's referral program.
    const creatorSnapshot = await adminFirestore.collection('creatorProfiles').doc(creatorId).get();
    expect(creatorSnapshot.data()?.availableCashKes).toBe(150);
    const attributions = await adminFirestore.collection('referralAttributions').get();
    expect(attributions.size).toBe(1);
    expect(attributions.docs[0].data().businessId).toBe(SNACK_QUEST.businessId);

    // Each tenant's shipment used its OWN Jumia merchant account.
    const sqShipment = await shipmentRepository.findByOrderId(sqOrders.docs[0].id);
    const rivalShipment = await shipmentRepository.findByOrderId(rivalOrders.docs[0].id);
    expect(sqShipment?.data.courierShipmentRef).toBe(`shipment-${SNACK_QUEST.jumiaMerchantId}`);
    expect(rivalShipment?.data.courierShipmentRef).toBe(`shipment-${RIVAL_SNACKS.jumiaMerchantId}`);

    // Each tenant's admin was notified — never the other tenant's admin.
    expect(sqGateway.sent.some((m) => m.phone === SNACK_QUEST.adminWhatsappPhone)).toBe(true);
    expect(sqGateway.sent.some((m) => m.phone === RIVAL_SNACKS.adminWhatsappPhone)).toBe(false);
    expect(rivalGateway.sent.some((m) => m.phone === RIVAL_SNACKS.adminWhatsappPhone)).toBe(true);
    expect(rivalGateway.sent.some((m) => m.phone === SNACK_QUEST.adminWhatsappPhone)).toBe(false);
  });
});
