import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { ConversationService } from '@/services/conversationService';
import { paymentService } from '@/services/paymentService';
import { conversationRepository } from '@/repositories/conversationRepository';
import { conversationCheckoutSnapshotRepository } from '@/repositories/conversationCheckoutSnapshotRepository';
import { discountCodeRepository } from '@/repositories/discountCodeRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { orderRepository } from '@/repositories/orderRepository';
import { shipmentRepository } from '@/repositories/shipmentRepository';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
import { notificationTemplateRepository } from '@/repositories/notificationTemplateRepository';
import { businessRepository } from '@/repositories/businessRepository';
import { walletService } from '@/services/walletService';
import { featureFlagService } from '@/services/featureFlagService';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { pickupStationRepository } from '@/repositories/pickupStationRepository';
import { deliveryZoneRuleRepository } from '@/repositories/deliveryZoneRuleRepository';
import { POST as priceDoorDeliveryRoute } from '@/app/api/internal/conversations/[conversationId]/price-door-delivery/route';
import { FakeWhatsAppGateway } from '../helpers/fakeWhatsAppGateway';

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

const PHONE = '254712345678';

interface TenantConfig {
  businessId: string;
  name: string;
  whatsappPhoneNumberId: string;
  adminWhatsappPhone: string;
  shortcode: string;
  metaPixelId: string;
  tiktokPixelCode: string;
}

const SNACK_QUEST: TenantConfig = {
  businessId: 'biz-snack-quest',
  name: 'Snack Quest',
  whatsappPhoneNumberId: 'wa-snack-quest',
  adminWhatsappPhone: '254799999001',
  shortcode: '174379',
  metaPixelId: 'pixel-snack-quest',
  tiktokPixelCode: 'ttpixel-snack-quest',
};

const RIVAL_SNACKS: TenantConfig = {
  businessId: 'biz-rival-snacks',
  name: 'Rival Snacks Co',
  whatsappPhoneNumberId: 'wa-rival-snacks',
  adminWhatsappPhone: '254799999002',
  shortcode: '555555',
  metaPixelId: 'pixel-rival-snacks',
  tiktokPixelCode: 'ttpixel-rival-snacks',
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
      whatsappCustomerNumber: null,
      status: 'active',
    },
    'system',
  );
  await businessIntegrationSecretRepository.set(tenant.businessId, 'daraja', {
    consumerKey: `key-${tenant.businessId}`,
    consumerSecret: `secret-${tenant.businessId}`,
    shortcode: tenant.shortcode,
    accountType: 'till',
    passkey: 'test-passkey',
    callbackUrl: `https://example.com/api/webhooks/daraja/${tenant.businessId}`,
    env: 'sandbox',
  });
  await businessIntegrationSecretRepository.set(tenant.businessId, 'whatchimp', {
    apiKey: `wa-key-${tenant.businessId}`,
    phoneNumberId: tenant.whatsappPhoneNumberId,
  });
  // Customer-facing replies are texts now (§ customer communications
  // move to SMS), so this journey needs an SMS account too.
  await businessIntegrationSecretRepository.set(tenant.businessId, 'textSms', {
    apiKey: 'sms-key',
    partnerId: 'sms-partner',
    senderId: 'SNACKQUEST',
  });
  await businessIntegrationSecretRepository.set(tenant.businessId, 'meta', {
    pixelId: tenant.metaPixelId,
    accessToken: `meta-token-${tenant.businessId}`,
  });
  await businessIntegrationSecretRepository.set(tenant.businessId, 'tiktok', {
    pixelCode: tenant.tiktokPixelCode,
    accessToken: `tiktok-token-${tenant.businessId}`,
  });
}

async function seedPackages(businessId: string) {
  const actor = 'system';
  await packageRepository.create(
    { businessId, name: 'Starter Box', description: 'Starter', priceKes: 2500, isActive: true, imageUrl: null },
    actor,
  );
  await packageRepository.create(
    { businessId, name: 'Deluxe Box', description: 'Deluxe', priceKes: 3500, isActive: true, imageUrl: null },
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
      courier: 'whatchimp',
      name: 'Naivas CBD Station',
      latitude: -1.2833,
      longitude: 36.8167,
      description: 'Nairobi CBD',
      county: 'Nairobi',
      town: 'CBD',
      zone: 'Upcountry',
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
    // WhatChimp sends URLSearchParams (form-encoded); Daraja/Jumia/Meta
    // still send JSON strings. Only parse what is actually JSON.
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};

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
    if (urlStr.includes('business-api.tiktok.com')) {
      return new Response(JSON.stringify({ code: 0, message: 'OK' }), { status: 200 });
    }
    if (urlStr.includes('/api/services/sendsms/')) {
      return new Response(
        JSON.stringify({
          responses: [
            {
              'response-code': 200,
              'response-description': 'Success',
              messageid: `sms-${Date.now()}-${Math.random()}`,
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (urlStr.includes('/whatsapp/')) {
      // Real WhatchimpGateway HTTP call — only hit when a Service uses the
      // module-level singleton (e.g. the internal agent-pricing route,
      // which doesn't take a FakeWhatsAppGateway) instead of a test's
      // own `new ConversationService(fakeGateway)`.
      return new Response(
        JSON.stringify({ status: '1', wa_message_id: `wamid-${Date.now()}` }),
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

/**
 * A failed STK callback, shaped exactly as Safaricom sends one: a
 * result code and description, and no `CallbackMetadata` at all.
 */
function darajaFailurePayload(shortcode: string, resultCode: number, resultDesc: string) {
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: `merchant-${shortcode}`,
        CheckoutRequestID: `checkout-${shortcode}`,
        ResultCode: resultCode,
        ResultDesc: resultDesc,
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
    'outboundGatewayCalls',
    'pickupStations',
    'customerWallets',
    'outboundMessages',
    'notificationTemplates',
    // Delivery pricing is per-test state like everything else here.
    // Left out, a rule seeded by one test survived into the next, and
    // the door-delivery fallback suite exists precisely to exercise the
    // case where no Tushop rate is configured.
    'deliveryZoneRules',
    'discountCodes',
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
  await service.start(businessId, PHONE, { text: 'PAY' }); // explicit customer opt-in — never automatic
}

describe('the full customer journey: Meta ad through Fargo shipment confirmation', () => {
  beforeEach(async () => {
    await seedBusiness(SNACK_QUEST);
    await seedPackages(SNACK_QUEST.businessId);
    await seedFreePickupStation(SNACK_QUEST.businessId);
  });

  it('closes the entire loop: order created, inventory reserved, Fargo shipment created, Meta CAPI dispatched, admin notified', async () => {
    const fetchMock = mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

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
    expect(order.delivery.provider).toBe('tushop');
    expect(order.payment.mpesaReceiptNumber).toBe('NLJ7RT61SV');
    // A native WhatsApp-originated order has no browser to attribute to.
    expect(order.attribution).toBeNull();
    // The first order for a fresh business starts its sequence at 1
    // (§ order references), and the customer-facing confirmation
    // quotes the same human-friendly reference, not the raw doc id.
    expect(order.orderNumber).toBe(1);

    const items = await orderRepository.listItems(orderDoc.id);
    expect(items).toHaveLength(1);
    expect(items[0].packageLabel).toBe('Starter Box');

    const shipment = await shipmentRepository.findByOrderId(orderDoc.id);
    expect(shipment?.data.businessId).toBe(SNACK_QUEST.businessId);
    // Fargo is booked by hand, so a new shipment waits for a human
    // rather than arriving with a courier reference already attached.
    expect(shipment?.data.status).toBe('pending_manual_booking');
    // Manual booking: Fargo issues a waybill at drop-off, so there is
    // no courier reference until a human records one.
    expect(shipment?.data.courierShipmentRef).toBeNull();

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
    expect(gateway.sent.at(-1)?.text).toContain('SQ-1');
  });

  it('rejects checkout for the exit-intent rescue offer once its offerExpiresAt has passed', async () => {
    const service = (() => { const g = new FakeWhatsAppGateway(); return new ConversationService(g, g); })();
    const rescueId = await packageRepository.create(
      {
        businessId: SNACK_QUEST.businessId,
        name: 'Test Box',
        description: 'Try before you commit',
        priceKes: 1500,
        isActive: true,
        imageUrl: null,
        isRescueOffer: true,
        offerExpiresAt: Timestamp.fromMillis(Date.now() - 1000) as unknown as import('@/types').Package['offerExpiresAt'],
      },
      'admin',
    );

    await expect(
      service.startWebCheckout(SNACK_QUEST.businessId, {
        packageId: rescueId,
        quantity: 1,
        customerName: 'Jane Doe',
        phone: PHONE,
        county: 'Nairobi',
        deliveryMethod: 'pickup',
        pickupStationId: (await pickupStationRepository.listActive(SNACK_QUEST.businessId))[0]?.id,
        attribution: { channel: 'web', landingUrl: 'https://snackquests.shop/checkout' },
      }),
    ).rejects.toThrow(/not available/);
  });

  it('records rescue_offer_purchase_completed when a completed order is for the exit-intent rescue offer, and stays silent for a normal one', async () => {
    mockAllProviders();
    const service = (() => { const g = new FakeWhatsAppGateway(); return new ConversationService(g, g); })();
    const rescueId = await packageRepository.create(
      {
        businessId: SNACK_QUEST.businessId,
        name: 'Test Box',
        description: 'Try before you commit',
        priceKes: 1500,
        isActive: true,
        imageUrl: null,
        isRescueOffer: true,
      },
      'admin',
    );
    // A dedicated Zone 1 station, not the shared `seedFreePickupStation`
    // one — that fixture's `zone: 'Nairobi'` only the native-bot
    // selection path tolerates; `startWebCheckout` validates against
    // `isFargoZone`, same reasoning as the ad-attribution test above.
    const stationId = await pickupStationRepository.create(
      {
        businessId: SNACK_QUEST.businessId,
        courier: 'whatchimp',
        name: 'Zone 1 Station',
        latitude: -1.2833,
        longitude: 36.8167,
        description: 'Nairobi CBD',
        county: 'Nairobi',
        town: 'CBD',
        zone: 'Upcountry',
        shippingOrigin: 'Nairobi',
        packageCategory: 'small',
        deliveryFeeKes: 0,
        isActive: true,
        searchTokens: ['zone1'],
      },
      'system',
    );

    const checkout = await service.startWebCheckout(SNACK_QUEST.businessId, {
      packageId: rescueId,
      quantity: 1,
      customerName: 'Jane Doe',
      phone: PHONE,
      county: 'Nairobi',
      deliveryMethod: 'pickup',
      pickupStationId: stationId,
      attribution: { channel: 'web', landingUrl: 'https://snackquests.shop/checkout' },
    });

    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, checkout.pricing.totalKes),
    );
    expect(callback.status).toBe('succeeded');
    await service.handlePaymentResult(callback);

    const events = await adminFirestore
      .collection('analyticsEvents')
      .where('event', '==', 'rescue_offer_purchase_completed')
      .get();
    expect(events.size).toBe(1);
    expect(events.docs[0].data()).toMatchObject({
      businessId: SNACK_QUEST.businessId,
      visitorId: null,
      metadata: { packageId: rescueId, amountKes: checkout.pricing.totalKes },
    });

    // The earlier, normal-box purchase in this same describe block's
    // other test must never have produced this event — asserted here
    // implicitly by `events.size === 1` counting only what this test
    // itself created (collections are wiped in `beforeEach`).
  });

  /*
   * The exact failure a real customer hit: order SQYXHEJV, KES 5,300,
   * ResultCode 1037 "DS timeout user cannot be reached." — the prompt
   * never got to their handset. The screen told them it "may not have
   * reached your phone, or was cancelled before you entered your PIN",
   * hedging across two causes when Safaricom had already said which.
   *
   * This walks the whole path rather than the classifier alone, because
   * the classifier was never the weak part: the code and description
   * were being recorded on the attempt and simply never travelling as
   * far as the customer.
   */
  it('carries a real failure reason from the Daraja callback all the way to the payment screen', async () => {
    mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

    // Door delivery is priced from a zone rule; without one the
    // checkout refuses before any payment can be attempted.
    await deliveryZoneRuleRepository.upsertIfMissing({
      businessId: SNACK_QUEST.businessId,
      zone: 'Nairobi Metro — Next Day',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      courier: 'tushop',
      feeKes: 250,
    });

    const [box] = await packageRepository.listActive(SNACK_QUEST.businessId);
    const checkout = await service.startWebCheckout(SNACK_QUEST.businessId, {
      packageId: box.id,
      quantity: 1,
      customerName: 'Fredrick N',
      phone: PHONE,
      county: 'Nairobi',
      deliveryMethod: 'door',
      addressText: 'Kensington Court, Valley Road',
      attribution: { channel: 'web', landingUrl: 'https://snackquests.shop/checkout' },
    });

    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaFailurePayload(SNACK_QUEST.shortcode, 1037, 'DS timeout user cannot be reached.'),
    );
    expect(callback.status).toBe('failed');
    await service.handlePaymentResult(callback);

    const status = await service.getWebCheckoutStatus(
      SNACK_QUEST.businessId,
      checkout.checkoutSessionId,
    );

    expect(status.paymentStatus).toBe('failed');
    // Named, not hedged: this one never reached the phone, and the
    // customer is told to check the phone rather than to stop
    // cancelling something they never saw.
    expect(status.paymentFailure).toMatchObject({
      resultCode: 1037,
      category: 'unreachable',
    });
    expect(status.paymentFailure?.message).toMatch(/could not reach your phone/i);
    expect(status.paymentFailure?.nextStep).toMatch(/switched on|network/i);
    // No order, and no money: the point of saying anything at all.
    expect(status.orderId).toBeNull();
  });

  /*
   * A code outside the known set must reach the screen as null, so the
   * screen says only what is certain. Sending a plausible guess instead
   * is the failure mode this whole change exists to remove.
   */
  it('reports no reason at all, rather than a guess, for an unrecognised result code', async () => {
    mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

    // Door delivery is priced from a zone rule; without one the
    // checkout refuses before any payment can be attempted.
    await deliveryZoneRuleRepository.upsertIfMissing({
      businessId: SNACK_QUEST.businessId,
      zone: 'Nairobi Metro — Next Day',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      courier: 'tushop',
      feeKes: 250,
    });

    const [box] = await packageRepository.listActive(SNACK_QUEST.businessId);
    const checkout = await service.startWebCheckout(SNACK_QUEST.businessId, {
      packageId: box.id,
      quantity: 1,
      customerName: 'Jane Doe',
      phone: PHONE,
      county: 'Nairobi',
      deliveryMethod: 'door',
      addressText: 'Kilimani',
      attribution: { channel: 'web', landingUrl: 'https://snackquests.shop/checkout' },
    });

    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaFailurePayload(SNACK_QUEST.shortcode, 4321, 'Something Safaricom has not documented'),
    );
    expect(callback.status).toBe('failed');
    await service.handlePaymentResult(callback);

    const status = await service.getWebCheckoutStatus(
      SNACK_QUEST.businessId,
      checkout.checkoutSessionId,
    );
    expect(status.paymentStatus).toBe('failed');
    expect(status.paymentFailure).toBeNull();
  });

  /*
   * A box bought for somebody else (§ send a box as a gift).
   *
   * The end-to-end property is that the two people stay separate all
   * the way down: the courier is told about the recipient because they
   * are the one at the door, and every order notification stays with
   * the buyer because a "your box is on the way" text is exactly what
   * a surprise is not supposed to send.
   */
  it('ships a gift to the recipient while every order update stays with the buyer', async () => {
    mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

    await deliveryZoneRuleRepository.upsertIfMissing({
      businessId: SNACK_QUEST.businessId,
      zone: 'Nairobi Metro — Next Day',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      courier: 'tushop',
      feeKes: 250,
    });

    const [box] = await packageRepository.listActive(SNACK_QUEST.businessId);
    const checkout = await service.startWebCheckout(SNACK_QUEST.businessId, {
      packageId: box.id,
      quantity: 1,
      customerName: 'Fredrick Nyanjwa',
      phone: PHONE,
      county: 'Nairobi',
      deliveryMethod: 'door',
      addressText: 'Kensington Court, Valley Road',
      gift: {
        recipientName: 'Amina Wanjiru',
        recipientPhone: '0790999780',
        message: 'Happy birthday!',
      },
      attribution: { channel: 'web', landingUrl: 'https://snackquests.shop/checkout' },
    });

    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, checkout.pricing.totalKes),
    );
    expect(callback.status).toBe('succeeded');
    await service.handlePaymentResult(callback);

    const orders = await adminFirestore.collection('orders').get();
    expect(orders.size).toBe(1);
    const order = orders.docs[0].data();

    // The buyer is still the customer on the order. Every report that
    // asks who bought this keeps its existing answer.
    expect(order.customer.customerName).toBe('Fredrick Nyanjwa');
    expect(order.customer.phoneNumber).toBe(PHONE);
    expect(order.gift).toMatchObject({
      recipientName: 'Amina Wanjiru',
      recipientPhone: '254790999780',
      message: 'Happy birthday!',
    });

    // The waybill names whoever is actually at the address.
    const shipments = await adminFirestore.collection('shipments').get();
    expect(shipments.size).toBe(1);
    expect(shipments.docs[0].data()).toMatchObject({
      recipientName: 'Amina Wanjiru',
      recipientPhone: '254790999780',
    });

    /*
     * The surprise, asserted rather than assumed: nothing this order
     * produced was addressed to the recipient. If a future change
     * routes a confirmation or dispatch text off the shipment instead
     * of the buyer, this is what catches it.
     */
    const messages = await adminFirestore.collection('outboundMessages').get();
    const recipientRefs = messages.docs.map((doc) => doc.data().recipientRef);
    expect(recipientRefs).not.toContain('254790999780');

    // And the buyer sees who it is going to, before it leaves.
    const status = await service.getWebCheckoutStatus(
      SNACK_QUEST.businessId,
      checkout.checkoutSessionId,
    );
    expect(status.giftRecipientName).toBe('Amina Wanjiru');
  });

  /** A gift that cannot be delivered fails as a message the buyer can fix, before any order exists. */
  it('refuses a half-filled gift instead of quietly shipping it to the buyer', async () => {
    mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

    await deliveryZoneRuleRepository.upsertIfMissing({
      businessId: SNACK_QUEST.businessId,
      zone: 'Nairobi Metro — Next Day',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      courier: 'tushop',
      feeKes: 250,
    });

    const [box] = await packageRepository.listActive(SNACK_QUEST.businessId);
    await expect(
      service.startWebCheckout(SNACK_QUEST.businessId, {
        packageId: box.id,
        quantity: 1,
        customerName: 'Fredrick Nyanjwa',
        phone: PHONE,
        county: 'Nairobi',
        deliveryMethod: 'door',
        addressText: 'Kensington Court, Valley Road',
        // A name, no number: plainly a gift, and undeliverable.
        gift: { recipientName: 'Amina Wanjiru' },
        attribution: { channel: 'web', landingUrl: 'https://snackquests.shop/checkout' },
      }),
    ).rejects.toThrow(/number/i);

    // Nothing was written on the way to that rejection.
    const orders = await adminFirestore.collection('orders').get();
    expect(orders.size).toBe(0);
  });

  /*
   * The business's own new-order alert (§ admin order alert).
   *
   * Worth an end-to-end test rather than a unit one because the thing
   * that was broken was never the sending — it was that
   * `adminWhatsappPhone` pointed at a channel nobody had enabled, so
   * the alert this replaces had never once fired in production.
   */
  it('texts the business for a new order, and nobody at all when no number is set', async () => {
    mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

    await deliveryZoneRuleRepository.upsertIfMissing({
      businessId: SNACK_QUEST.businessId,
      zone: 'Nairobi Metro — Next Day',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      courier: 'tushop',
      feeKes: 250,
    });
    await adminFirestore
      .collection('businesses')
      .doc(SNACK_QUEST.businessId)
      .update({ adminOrderSmsPhone: '254759209705' });
    // This suite wipes `notificationTemplates` between tests, so the
    // catalogue entry has to exist for the send to render at all.
    await notificationTemplateRepository.upsert({
      templateCode: 'admin_new_order_sms',
      channel: 'sms',
      subject: null,
      heading: null,
      bodyTemplate:
        'Snack Quest: NEW ORDER {{orderRef}} — KES {{totalKes}}. {{summary}}. {{deliverySummary}}. {{customerName}} {{customerPhone}}.',
      ctaLabel: null,
      ctaUrl: null,
      htmlBodyTemplate: null,
      requiredParams: [
        'orderRef',
        'totalKes',
        'summary',
        'deliverySummary',
        'customerName',
        'customerPhone',
      ],
      version: 1,
      isActive: true,
    });

    const [box] = await packageRepository.listActive(SNACK_QUEST.businessId);
    const checkout = await service.startWebCheckout(SNACK_QUEST.businessId, {
      packageId: box.id,
      quantity: 1,
      customerName: 'Fredrick Nyanjwa',
      phone: PHONE,
      county: 'Nairobi',
      deliveryMethod: 'door',
      addressText: 'Kensington Court, Valley Road',
      attribution: { channel: 'web', landingUrl: 'https://snackquests.shop/checkout' },
    });

    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, checkout.pricing.totalKes),
    );
    await service.handlePaymentResult(callback);

    const messages = await adminFirestore
      .collection('outboundMessages')
      .where('recipientRef', '==', '254759209705')
      .get();
    expect(messages.size).toBe(1);
    const alert = messages.docs[0].data();
    expect(alert.templateCode).toBe('admin_new_order_sms');
    expect(alert.channel).toBe('sms');
    // The details that decide whether this needs acting on now.
    expect(alert.renderedBody).toContain('NEW ORDER');
    expect(alert.renderedBody).toContain(String(checkout.pricing.totalKes));
    expect(alert.renderedBody).toContain('Kensington Court');
  });

  /*
   * The influencer PR box (§ discount codes).
   *
   * A 100% code is not a bigger discount, it is a different kind of
   * order: nothing is charged, so there is no M-Pesa prompt to send and
   * no callback to wait for. Daraja rejects a zero-shilling push, so
   * getting this wrong does not produce a free order — it produces a
   * failed one.
   */
  it('completes a 100% discounted order with no payment prompt at all', async () => {
    const fetchMock = mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

    await deliveryZoneRuleRepository.upsertIfMissing({
      businessId: SNACK_QUEST.businessId,
      zone: 'Nairobi Metro — Next Day',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      courier: 'tushop',
      feeKes: 250,
    });
    await discountCodeRepository.create({
      businessId: SNACK_QUEST.businessId,
      code: 'PRBOX',
      kind: 'percentage',
      value: 100,
      // Without this the box is free and delivery is not, which is not
      // what anybody means by a PR box.
      waivesDelivery: true,
      maxRedemptions: 1,
      startsAt: null,
      expiresAt: null,
      isActive: true,
      note: 'Influencer PR',
      createdBy: 'admin-uid',
    });

    const [box] = await packageRepository.listActive(SNACK_QUEST.businessId);
    const checkout = await service.startWebCheckout(SNACK_QUEST.businessId, {
      packageId: box.id,
      quantity: 1,
      customerName: 'Amina Wanjiru',
      phone: PHONE,
      county: 'Nairobi',
      deliveryMethod: 'door',
      addressText: 'Kilimani',
      discountCode: 'prbox',
      attribution: { channel: 'web', landingUrl: 'https://snackquests.shop/checkout' },
    });

    expect(checkout.pricing.totalKes).toBe(0);
    expect(checkout.pricing.discountKes).toBe(box.data.priceKes);
    // The whole point: no prompt was sent, and none should have been.
    expect(checkout.stkPushSent).toBe(false);
    const stkCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('stkpush'),
    );
    expect(stkCalls).toHaveLength(0);

    // And yet it is a real order, through the same path every paid
    // order takes.
    const orders = await adminFirestore.collection('orders').get();
    expect(orders.size).toBe(1);
    expect(orders.docs[0].data().pricing.totalKes).toBe(0);
    const shipments = await adminFirestore.collection('shipments').get();
    expect(shipments.size).toBe(1);

    // The single use is spent, so the code cannot furnish a second box.
    const after = await discountCodeRepository.findByCode(SNACK_QUEST.businessId, 'PRBOX');
    expect(after?.redemptionCount).toBe(1);
    const second = await discountCodeRepository.claimRedemption(SNACK_QUEST.businessId, 'PRBOX');
    expect(second.claimed).toBe(false);
  });

  /** An invalid code fails the checkout rather than quietly charging full price for an order the customer thought was discounted. */
  it('refuses an exhausted code instead of silently charging full price', async () => {
    mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

    await deliveryZoneRuleRepository.upsertIfMissing({
      businessId: SNACK_QUEST.businessId,
      zone: 'Nairobi Metro — Next Day',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      courier: 'tushop',
      feeKes: 250,
    });
    await discountCodeRepository.create({
      businessId: SNACK_QUEST.businessId,
      code: 'SPENT',
      kind: 'percentage',
      value: 50,
      waivesDelivery: false,
      maxRedemptions: 1,
      startsAt: null,
      expiresAt: null,
      isActive: true,
      note: null,
      createdBy: 'admin-uid',
    });
    await discountCodeRepository.claimRedemption(SNACK_QUEST.businessId, 'SPENT');

    const [box] = await packageRepository.listActive(SNACK_QUEST.businessId);
    await expect(
      service.startWebCheckout(SNACK_QUEST.businessId, {
        packageId: box.id,
        quantity: 1,
        customerName: 'Jane Doe',
        phone: PHONE,
        county: 'Nairobi',
        deliveryMethod: 'door',
        addressText: 'Kilimani',
        discountCode: 'SPENT',
        attribution: { channel: 'web', landingUrl: 'https://snackquests.shop/checkout' },
      }),
    ).rejects.toThrow(/isn't valid/i);

    expect((await adminFirestore.collection('orders').get()).size).toBe(0);
  });

  it('attributes a web-originated order to the ad that drove it: Meta reports action_source "website", TikTok gets the ttclid (§ close the loop: ad-conversion attribution)', async () => {
    const fetchMock = mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

    const [box] = await packageRepository.listActive(SNACK_QUEST.businessId);
    // A dedicated station, not the shared `seedFreePickupStation` one
    // — that fixture's `zone: 'Nairobi'` predates real Jumia zone
    // pricing and only the native-bot selection path tolerates it;
    // `startWebCheckout` validates against `isFargoZone`, same as
    // `webCheckout.test.ts`'s own fixtures.
    const stationId = await pickupStationRepository.create(
      {
        businessId: SNACK_QUEST.businessId,
        courier: 'whatchimp',
        name: 'Zone 1 Station',
        latitude: -1.2833,
        longitude: 36.8167,
        description: 'Nairobi CBD',
        county: 'Nairobi',
        town: 'CBD',
        zone: 'Upcountry',
        shippingOrigin: 'Nairobi',
        packageCategory: 'small',
        deliveryFeeKes: 0,
        isActive: true,
        searchTokens: ['zone1'],
      },
      'system',
    );

    const checkout = await service.startWebCheckout(SNACK_QUEST.businessId, {
      packageId: box.id,
      quantity: 1,
      customerName: 'Jane Doe',
      phone: PHONE,
      county: 'Nairobi',
      deliveryMethod: 'pickup',
      pickupStationId: stationId,
      attribution: {
        channel: 'web',
        landingUrl: 'https://snackquests.shop/checkout',
        ttclid: 'tt-real-click-id',
      },
    });

    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, checkout.pricing.totalKes),
    );
    expect(callback.status).toBe('succeeded');
    await service.handlePaymentResult(callback);

    const finalConversation = await conversationRepository.findById(checkout.checkoutSessionId);
    expect(finalConversation?.status).toBe('completed');

    const metaCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('graph.facebook.com'));
    const metaBody = JSON.parse((metaCall![1] as RequestInit).body as string);
    expect(metaBody.data[0].action_source).toBe('website');
    expect(metaBody.data[0].event_source_url).toBe('https://snackquests.shop/checkout');

    const tiktokCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('business-api.tiktok.com'));
    expect(tiktokCall).toBeDefined();
    const tiktokBody = JSON.parse((tiktokCall![1] as RequestInit).body as string);
    expect(tiktokBody.event_source_id).toBe(SNACK_QUEST.tiktokPixelCode);
    expect(tiktokBody.data[0].event).toBe('Purchase');
    expect(tiktokBody.data[0].user.ttclid).toBe('tt-real-click-id');
    expect(tiktokBody.data[0].user.phone_numbers[0]).toMatch(/^[0-9a-f]{64}$/);

    const ordersSnapshot = await adminFirestore
      .collection('orders')
      .where('businessId', '==', SNACK_QUEST.businessId)
      .get();
    expect(ordersSnapshot.docs).toHaveLength(1);
    expect(ordersSnapshot.docs[0].data().attribution).toEqual({
      channel: 'web',
      landingUrl: 'https://snackquests.shop/checkout',
      ttclid: 'tt-real-click-id',
    });
  });

  it('validates a referral code, discounts the order, and credits the creator commission', async () => {
    mockAllProviders();

    const creatorId = 'creator-1';
    await adminFirestore
      .collection('businesses')
      .doc(SNACK_QUEST.businessId)
      .collection('creatorMemberships')
      .doc(creatorId)
      .set({
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
    const service = new ConversationService(gateway, gateway);
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
      .collection('businesses')
      .doc(SNACK_QUEST.businessId)
      .collection('creatorMemberships')
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
        imageUrl: null,
      },
      'system',
    );

    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Hi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' }); // cheapest = Limited Edition
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Jane Doe, Nairobi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '2' }); // Jumia Pickup Station
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'CBD' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'no' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'PAY' });

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
    const service = new ConversationService(gateway, gateway);

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

describe('the full Fargo pickup point journey: search, select, auto-priced fee, order, tracking confirmation', () => {
  beforeEach(async () => {
    await seedBusiness(SNACK_QUEST);
    await seedPackages(SNACK_QUEST.businessId);
  });

  it('walks a customer from station search through a confirmed order with a real delivery fee and the exact required tracking-URL copy', async () => {
    mockAllProviders();

    await pickupStationRepository.create(
      {
        businessId: SNACK_QUEST.businessId,
        courier: 'whatchimp',
        name: 'G4S Kasarani Station',
        latitude: -1.2201,
        longitude: 36.8899,
        description: 'Kasarani, opposite Sportsview Hotel',
        county: 'Nairobi',
        town: 'Kasarani',
        zone: 'Upcountry',
        shippingOrigin: 'Nairobi',
        packageCategory: 'small',
        deliveryFeeKes: 250,
        isActive: true,
        searchTokens: ['g4s', 'kasarani', 'station', 'nairobi'],
      },
      'system',
    );

    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Hi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' }); // Starter Box (2500)
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Jane Doe, Nairobi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '2' }); // Jumia Pickup Station

    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Kasarani' }); // search by town
    expect(gateway.sent.at(-1)?.text).toContain('G4S Kasarani Station');

    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' }); // select the station
    expect(gateway.sent.at(-1)?.text).toContain('KES 250'); // fee auto-populated, never typed by the customer

    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'no' }); // no referral code
    const summaryTurn = await service.start(SNACK_QUEST.businessId, PHONE, { text: 'huh?' });
    // An unrecognized reply here must never trigger payment — only PAY does.
    expect(summaryTurn.botReply).not.toContain('check your phone');
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'PAY' });

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
    expect(order.delivery.provider).toBe('tushop');
    // Fargo is booked by hand, so nothing to link to at order time.
    expect(order.delivery.trackingUrl).toBeNull();
    expect(order.pricing.totalKes).toBe(2750);
    expect(order.pricing.deliveryFeeKes).toBe(250);

    const finalMessage = gateway.sent.at(-1)?.text ?? '';
    expect(finalMessage).toContain('curated within 24 hours');
    // Tushop, not Fargo: every parcel is handed to Tushop, who use
    // their own Fargo partnership to reach a pickup point.
    expect(finalMessage).toContain('Tushop');
  });
});

describe('door delivery, human-assisted fallback (used only when no Tushop rate is configured)', () => {
  beforeAll(() => {
    process.env.INTERNAL_AGENT_API_KEY = 'test-secret';
  });

  beforeEach(async () => {
    await seedBusiness(SNACK_QUEST);
    await seedPackages(SNACK_QUEST.businessId);
  });

  it('collects address details, escalates to a human agent with the exact required copy, and pauses the bot', async () => {
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Hi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' }); // Starter Box
    await service.start(SNACK_QUEST.businessId, PHONE, { text: 'Jane Doe, Nairobi' });
    await service.start(SNACK_QUEST.businessId, PHONE, { text: '1' }); // Door Delivery (Nairobi Only)

    const escalationTurn = await service.start(SNACK_QUEST.businessId, PHONE, {
      text: '123 Ngong Road, near ABC Bank, Kilimani, 0712345678',
    });
    expect(escalationTurn.botReply).toBe(
      "Thanks! One of our team members will confirm your delivery cost shortly and complete your order.",
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
    expect(adminMessages[0].text).toContain('Door delivery');
    expect(adminMessages[0].text).toContain('123 Ngong Road');
    expect(adminMessages[0].text).toContain('Kilimani');

    // The bot no longer auto-responds — a human is driving this thread now.
    const ignored = await service.start(SNACK_QUEST.businessId, PHONE, { text: 'hello?' });
    expect(ignored.botReply).toBeNull();
  });

  it('prices the order through the real internal agent API WITHOUT charging, then only charges once the customer replies PAY, completing with the nested delivery/provider schema', async () => {
    mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

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

    // Pricing alone must NEVER charge the customer (redesign:
    // customer-controlled STK push) — the bot is back in control,
    // waiting on an explicit PAY reply, and nothing has been frozen
    // or charged yet.
    const pricedConversation = await conversationRepository.findById(conversationId);
    expect(pricedConversation?.status).toBe('active');
    expect(pricedConversation?.currentStep).toBe('awaiting_customer_payment_confirmation');
    expect(pricedConversation?.conversationCheckoutSnapshotId).toBeNull();
    expect(pricedConversation?.stateBlob.deliveryFeeKes).toBe(400);

    const paymentIntentsBeforePay = await adminFirestore.collection('paymentIntents').get();
    expect(paymentIntentsBeforePay.size).toBe(0);

    // The pricing route runs through the module-level `conversationService`
    // singleton (its real WhatsApp gateway, not this test's local
    // `gateway`) — read the persisted transcript instead of `gateway.sent`.
    const messagesAfterPricing = await conversationRepository.listMessages(conversationId);
    const quotation = messagesAfterPricing.at(-1)?.body ?? '';
    expect(quotation).toContain('Delivery: KES 400');
    expect(quotation).toContain('Total: KES 2900');
    expect(quotation).toContain('Reply PAY whenever you are ready to receive the M-Pesa payment request.');
    expect(quotation).not.toContain('check your phone'); // no STK sent yet

    // Only NOW — the customer's own explicit reply — may payment begin.
    // This goes through the test's local `service`/`gateway`, since the
    // conversation is back under bot control (status: 'active').
    const payTurn = await service.start(SNACK_QUEST.businessId, PHONE, { text: 'PAY' });
    expect(payTurn.botReply).toContain('Sending your M-Pesa payment prompt now');

    const pricedAndConfirmed = await conversationRepository.findById(conversationId);
    expect(pricedAndConfirmed?.status).toBe('awaiting_payment');
    const snapshotId = pricedAndConfirmed!.conversationCheckoutSnapshotId!;
    const snapshot = await conversationCheckoutSnapshotRepository.findById(snapshotId);
    expect(snapshot?.delivery.method).toBe('door');
    expect(snapshot?.delivery.provider).toBe('tushop');
    expect(snapshot?.delivery.feeKes).toBe(400);
    expect(snapshot?.delivery.addressText).toBe('123 Ngong Road');
    expect(snapshot?.totalKes).toBe(2900); // 2500 box + a 400 fee the agent quoted, no automated referral step

    const paymentIntentsAfterPay = await adminFirestore.collection('paymentIntents').get();
    expect(paymentIntentsAfterPay.size).toBe(1);

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
    expect(order.delivery.provider).toBe('tushop');
    expect(order.delivery.feeKes).toBe(400);
    expect(order.delivery.addressText).toBe('123 Ngong Road');
    expect(order.delivery.estate).toBe('Kilimani');
    expect(order.delivery.trackingUrl).toBeNull(); // manual booking carries no tracker
    expect(order.pricing.totalKes).toBe(2900);
    expect(order.payment.mpesaReceiptNumber).toBe('NLJ7RT61SV');

    // Fargo has no booking API in this codebase — a human
    // agent must book the courier themselves; the shipment record
    // reflects that real state, not a fabricated "created" status.
    const shipment = await shipmentRepository.findByOrderId(ordersSnapshot.docs[0].id);
    expect(shipment?.data.status).toBe('pending_manual_booking');
    expect(shipment?.data.provider).toBe('tushop');
    expect(shipment?.data.courierShipmentRef).toBeNull();

    const finalMessage = gateway.sent.at(-1)?.text ?? '';
    expect(finalMessage).toContain('Payment received');
    expect(finalMessage).not.toContain('Jumia');
  });

  it('rejects pricing a conversation that was never escalated', async () => {
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);
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
        imageUrl: null,
      },
      'system',
    );

    // A referral code that means something for Snack Quest and
    // literally does not exist for Rival Snacks.
    const creatorId = 'creator-snack-quest-1';
    await adminFirestore
      .collection('businesses')
      .doc(SNACK_QUEST.businessId)
      .collection('creatorMemberships')
      .doc(creatorId)
      .set({
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
    const sqService = new ConversationService(sqGateway, sqGateway);
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: 'Hi' });
    // Snack Quest's cheapest package is index 1: Starter Box (2500).
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: '1' });
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: 'Jane Doe, Nairobi' });
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: '2' }); // Jumia Pickup Station
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: 'CBD' });
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: '1' }); // select the seeded (free) station
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: 'SQ10' }); // valid here
    await sqService.start(SNACK_QUEST.businessId, PHONE, { text: 'PAY' });

    const rivalGateway = new FakeWhatsAppGateway();
    const rivalService = new ConversationService(rivalGateway, rivalGateway);
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: 'Hi' });
    // Rival's only package is index 1: Rival Mega Box (4200).
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: '1' });
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: 'Jane Doe, Nairobi' });
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: '2' }); // Jumia Pickup Station
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: 'CBD' });
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: '1' });
    // The SAME code, meaningless here — must NOT discount Rival's order.
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: 'SQ10' });
    await rivalService.start(RIVAL_SNACKS.businessId, PHONE, { text: 'PAY' });

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
    // Each tenant's order-number sequence is its own — the first order
    // for a fresh business always starts at 1, regardless of what any
    // other business's counter is doing (§ order references).
    expect(sqOrders.docs[0].data().orderNumber).toBe(1);
    expect(rivalOrders.docs[0].data().orderNumber).toBe(1);

    // The creator only got credited for the Snack Quest order — Rival
    // Snacks never touched Snack Quest's referral program.
    const creatorSnapshot = await adminFirestore
      .collection('businesses')
      .doc(SNACK_QUEST.businessId)
      .collection('creatorMemberships')
      .doc(creatorId)
      .get();
    expect(creatorSnapshot.data()?.availableCashKes).toBe(150);
    const attributions = await adminFirestore.collection('referralAttributions').get();
    expect(attributions.size).toBe(1);
    expect(attributions.docs[0].data().businessId).toBe(SNACK_QUEST.businessId);

    // Each tenant's shipment used its OWN Jumia merchant account.
    const sqShipment = await shipmentRepository.findByOrderId(sqOrders.docs[0].id);
    const rivalShipment = await shipmentRepository.findByOrderId(rivalOrders.docs[0].id);
    // Tenant isolation, asserted on the shipment's own business rather
    // than on a courier reference — manual booking produces none until
    // a human records the waybill.
    expect(sqShipment?.data.businessId).toBe(SNACK_QUEST.businessId);
    expect(rivalShipment?.data.businessId).toBe(RIVAL_SNACKS.businessId);
    expect(sqShipment?.id).not.toBe(rivalShipment?.id);

    // Each tenant's admin was notified — never the other tenant's admin.
    expect(sqGateway.sent.some((m) => m.phone === SNACK_QUEST.adminWhatsappPhone)).toBe(true);
    expect(sqGateway.sent.some((m) => m.phone === RIVAL_SNACKS.adminWhatsappPhone)).toBe(false);
    expect(rivalGateway.sent.some((m) => m.phone === RIVAL_SNACKS.adminWhatsappPhone)).toBe(true);
    expect(rivalGateway.sent.some((m) => m.phone === SNACK_QUEST.adminWhatsappPhone)).toBe(false);
  });
});

describe('customer loyalty / Quest wallet (§ Phase 4)', () => {
  beforeEach(async () => {
    await seedBusiness(SNACK_QUEST);
    await seedPackages(SNACK_QUEST.businessId);
    await seedFreePickupStation(SNACK_QUEST.businessId);
  });

  it("awards a welcome bonus on a customer's first paid order and discloses it in the confirmation message", async () => {
    await businessRepository.update(
      SNACK_QUEST.businessId,
      { loyaltyConfig: { enabled: true, firstOrderBonusKes: 100, repeatOrderIntervalCount: 5, repeatOrderBonusKes: 50 } },
      'test',
    );

    mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

    await walkToConfirmation(service, SNACK_QUEST.businessId);
    const conversation = await conversationRepository.findActiveByPhoneNumber(SNACK_QUEST.businessId, PHONE);
    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, 2500),
    );
    expect(callback.status).toBe('succeeded');
    await service.handlePaymentResult(callback);

    const balance = await walletService.getBalance(SNACK_QUEST.businessId, PHONE);
    expect(balance).toEqual({ balanceKes: 100, lifetimeCreditsEarnedKes: 100 });

    const ledger = await walletService.getLedger(SNACK_QUEST.businessId, PHONE);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].data).toMatchObject({ type: 'milestone_bonus', amountKes: 100, balanceAfterKes: 100 });

    expect(gateway.sent.at(-1)?.text).toContain('You just earned KES 100 wallet credit');
    expect(conversation).not.toBeNull();
  });

  it('auto-applies an existing wallet balance as a checkout discount, and only debits it once payment actually succeeds', async () => {
    // No loyaltyConfig set — proves redemption of an existing balance
    // works independently of whether new earning is enabled.
    await walletService.adjust(SNACK_QUEST.businessId, PHONE, 300, 'pre-seeded test balance', 'system');

    mockAllProviders();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

    await walkToConfirmation(service, SNACK_QUEST.businessId);

    const conversation = await conversationRepository.findActiveByPhoneNumber(SNACK_QUEST.businessId, PHONE);
    const snapshotId = conversation!.conversation.conversationCheckoutSnapshotId!;
    const snapshot = await conversationCheckoutSnapshotRepository.findById(snapshotId);
    expect(snapshot?.walletCreditAppliedKes).toBe(300);
    expect(snapshot?.totalKes).toBe(2200); // 2500 Starter Box - 300 wallet credit, free pickup

    expect(gateway.sent.some((m) => m.text.includes('KES 300 wallet credit applied — your total is now KES 2200'))).toBe(true);

    // Balance is NOT touched until payment actually succeeds.
    expect((await walletService.getBalance(SNACK_QUEST.businessId, PHONE)).balanceKes).toBe(300);

    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, 2200),
    );
    expect(callback.status).toBe('succeeded');
    await service.handlePaymentResult(callback);

    const balanceAfter = await walletService.getBalance(SNACK_QUEST.businessId, PHONE);
    expect(balanceAfter.balanceKes).toBe(0);

    const ledger = await walletService.getLedger(SNACK_QUEST.businessId, PHONE);
    const redemption = ledger.find((entry) => entry.data.type === 'checkout_redemption');
    expect(redemption?.data).toMatchObject({ amountKes: -300, balanceAfterKes: 0 });

    const ordersSnapshot = await adminFirestore.collection('orders').get();
    expect(ordersSnapshot.docs[0].data().pricing.totalKes).toBe(2200);
  });
});

describe('feature flags gate real behavior (§ Phase 6)', () => {
  beforeEach(async () => {
    await seedBusiness(SNACK_QUEST);
    await seedPackages(SNACK_QUEST.businessId);
  });

  it('answers the BALANCE command by default, and stops once the flag is disabled', async () => {
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);

    // Two different phone numbers, each texting BALANCE as their
    // very first-ever message — isolates the flag's effect from any
    // existing-conversation state-machine step.
    const enabledResult = await service.start(SNACK_QUEST.businessId, '254700000101', { text: 'BALANCE' });
    expect(enabledResult.botReply).toContain("don't have any wallet credit yet");

    await featureFlagService.setEnabled(SNACK_QUEST.businessId, 'customer_balance_command', false, 'staff-1');

    const disabledResult = await service.start(SNACK_QUEST.businessId, '254700000102', { text: 'BALANCE' });
    // With the command disabled, "BALANCE" is treated as ordinary free
    // text on a brand-new conversation — falls through to the normal
    // welcome message instead of a wallet-balance reply.
    expect(disabledResult.botReply).not.toContain('wallet');
  });
});

/**
 * § SMS-1: order confirmation SMS. Driven through the real payment
 * callback rather than by calling the private `completeOrder` — the
 * thing worth proving is that a genuine end-to-end purchase texts the
 * customer, and that a texting failure cannot cost a paid order.
 */
describe('order confirmation SMS (§ SMS-1)', () => {
  beforeEach(async () => {
    await seedBusiness(SNACK_QUEST);
    await seedPackages(SNACK_QUEST.businessId);
    await seedFreePickupStation(SNACK_QUEST.businessId);
  });

  async function seedConfirmationTemplate() {
    await notificationTemplateRepository.upsert({
      templateCode: 'order_confirmed_sms',
      channel: 'sms',
      subject: null,
      bodyTemplate:
        'Snack Quest: Payment received. Order {{orderRef}} is confirmed — KES {{totalKes}} ({{paymentRef}}). We will text you the moment it ships.',
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
      htmlBodyTemplate: null,
      requiredParams: ['orderRef', 'totalKes', 'paymentRef'],
      version: 1,
      isActive: true,
    });
  }

  async function payForABox() {
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);
    await walkToConfirmation(service, SNACK_QUEST.businessId);
    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, 2500),
    );
    await service.handlePaymentResult(callback);
    return (await adminFirestore.collection('orders').get()).docs[0];
  }

  it('texts the customer their order reference, total and M-Pesa receipt', async () => {
    mockAllProviders();
    await seedConfirmationTemplate();

    const orderDoc = await payForABox();

    const sent = await outboundMessageRepository.findById(`sms:order-confirmed:${orderDoc.id}`);
    expect(sent).not.toBeNull();
    expect(sent?.channel).toBe('sms');
    expect(sent?.recipientRef).toBe(PHONE);
    expect(sent?.renderedBody).toContain('SQ-1');
    expect(sent?.renderedBody).toContain('2500');
    expect(sent?.renderedBody).toContain('NLJ7RT61SV');
  });

  /** The WhatsApp confirmation is not replaced by the SMS — both go out. */
  it('still sends the WhatsApp confirmation alongside the SMS', async () => {
    mockAllProviders();
    await seedConfirmationTemplate();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);
    await walkToConfirmation(service, SNACK_QUEST.businessId);

    const callback = await paymentService.processCallback(
      SNACK_QUEST.businessId,
      darajaCallbackPayload(SNACK_QUEST.shortcode, 2500),
    );
    await service.handlePaymentResult(callback);

    expect(gateway.sent.some((message) => message.text.includes('Payment received!'))).toBe(true);
  });

  /**
   * The money is already collected and the order is real by this point,
   * so a missing template — or any other texting failure — must leave a
   * complete, confirmed order behind.
   */
  it('completes the order even when the SMS template does not exist', async () => {
    mockAllProviders();

    const orderDoc = await payForABox();

    expect(orderDoc.data().status).toBe('confirmed');
    expect(await outboundMessageRepository.findById(`sms:order-confirmed:${orderDoc.id}`)).toBeNull();
  });
});

/**
 * § super-admin manual payment orders — an order for a customer who has
 * already paid in cash, by their own M-Pesa transfer, or by bank
 * transfer. No STK push is made; the intent is settled from the super
 * admin's own record.
 *
 * These run the real journey rather than mocking the service, because
 * the property worth proving is that the *same* downstream path runs:
 * a cash order must reserve stock, award referral commission, create a
 * shipment and notify the customer exactly as a Daraja order does.
 */
describe('recording an order that is already paid (§ manual payment)', () => {
  beforeEach(async () => {
    await seedBusiness(SNACK_QUEST);
    await seedPackages(SNACK_QUEST.businessId);
    // Deliberately not `seedFreePickupStation`: its station sits in
    // zone 'Nairobi', which is not one of Jumia's six real zones, and
    // the *web* checkout path refuses an unzoned station outright
    // (the WhatsApp path the other tests use never reaches that check).
    await pickupStationRepository.create(
      {
        businessId: SNACK_QUEST.businessId,
        courier: 'whatchimp',
        name: 'Zoned CBD Station',
        latitude: -1.2833,
        longitude: 36.8167,
        description: 'Nairobi CBD',
        county: 'Nairobi',
        town: 'CBD',
        zone: 'Upcountry',
        shippingOrigin: 'Nairobi',
        packageCategory: 'small',
        deliveryFeeKes: 0,
        isActive: true,
        searchTokens: ['zoned', 'cbd', 'nairobi'],
      },
      'system',
    );
  });

  const RECORDER = { recordedByUid: 'super-admin-uid', recordedByName: 'Kelvin' };

  /** Package and station ids are generated at seed time, so they are looked up rather than hard-coded. */
  async function seededIds() {
    const boxes = await adminFirestore
      .collection('packages')
      .where('businessId', '==', SNACK_QUEST.businessId)
      .get();
    const starter = boxes.docs.find((doc) => doc.data().name === 'Starter Box');
    const stations = await adminFirestore
      .collection('pickupStations')
      .where('businessId', '==', SNACK_QUEST.businessId)
      .get();
    return { packageId: starter!.id, pickupStationId: stations.docs[0].id };
  }

  async function takePaidOrder(
    manualPayment: { method: 'cash' | 'mpesa_manual' | 'bank_transfer'; reference: string | null; note?: string | null },
  ) {
    const { packageId, pickupStationId } = await seededIds();
    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway, gateway);
    const result = await service.startWebCheckout(SNACK_QUEST.businessId, {
      packageId,
      quantity: 1,
      customerName: 'Wanjiru Kamau',
      phone: PHONE,
      county: 'Nairobi',
      deliveryMethod: 'pickup',
      pickupStationId,
      initiatedBy: { staffUid: RECORDER.recordedByUid, staffName: RECORDER.recordedByName },
      manualPayment: { ...RECORDER, note: null, ...manualPayment },
    });
    return { result, gateway, packageId };
  }

  /**
   * Staff place these while still with the customer, so the
   * confirmation goes out when they press send on the order page — not
   * the instant they hit save (§ manual confirmation SMS).
   */
  it('does not text the customer automatically', async () => {
    // Seeded deliberately: without a template `send()` throws before
    // it records anything, and the assertion below would pass whether
    // or not the suppression actually works.
    await notificationTemplateRepository.upsert({
      templateCode: 'order_confirmed_sms',
      channel: 'sms',
      subject: null,
      bodyTemplate: 'Order {{orderRef}} confirmed. KES {{totalKes}}, paid by {{paymentRef}}.',
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
      htmlBodyTemplate: null,
      requiredParams: ['orderRef', 'totalKes', 'paymentRef'],
      version: 1,
      isActive: true,
    });

    const { result } = await takePaidOrder({ method: 'cash', reference: null });

    const order = await orderRepository.findByConversationId(
      SNACK_QUEST.businessId,
      result.checkoutSessionId,
    );
    expect(order).not.toBeNull();
    const message = await adminFirestore
      .collection('outboundMessages')
      .doc(`sms:order-confirmed:${order!.id}`)
      .get();
    expect(message.exists).toBe(false);
  });

  it('creates a confirmed order without ever calling Daraja', async () => {
    const fetchMock = mockAllProviders();

    const { result } = await takePaidOrder({ method: 'cash', reference: null });

    expect(result.stkPushSent).toBe(false);
    const orders = await adminFirestore.collection('orders').get();
    expect(orders.size).toBe(1);
    expect(orders.docs[0].data().status).toBe('confirmed');

    // The decisive assertion: no STK push request was ever made.
    const darajaCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('stkpush'),
    );
    expect(darajaCalls).toHaveLength(0);
  });

  it('records who asserted the payment, on both the intent and the order', async () => {
    mockAllProviders();

    await takePaidOrder({ method: 'cash', reference: null, note: 'Paid at the Sarit stand' });

    const order = (await adminFirestore.collection('orders').get()).docs[0].data();
    expect(order.payment.manualPayment).toMatchObject({
      method: 'cash',
      reference: null,
      recordedByUid: 'super-admin-uid',
      recordedByName: 'Kelvin',
      note: 'Paid at the Sarit stand',
    });

    const intent = await adminFirestore.collection('paymentIntents').doc(order.payment.paymentIntentId).get();
    expect(intent.data()?.status).toBe('succeeded');
    expect(intent.data()?.manualPayment).toMatchObject({ method: 'cash', recordedByUid: 'super-admin-uid' });
  });

  /**
   * The single most important assertion here. A cash order has no
   * Safaricom receipt, and inventing one would make an asserted payment
   * indistinguishable from a verified one in every downstream report.
   */
  it('never fabricates an M-Pesa receipt for cash or a bank transfer', async () => {
    mockAllProviders();

    await takePaidOrder({ method: 'bank_transfer', reference: 'FT24ABCD1234' });

    const order = (await adminFirestore.collection('orders').get()).docs[0].data();
    expect(order.payment.mpesaReceiptNumber).toBeNull();
    expect(order.payment.manualPayment.reference).toBe('FT24ABCD1234');
  });

  it('keeps a customer-sent M-Pesa code as the real receipt', async () => {
    mockAllProviders();

    await takePaidOrder({ method: 'mpesa_manual', reference: 'TXY9KL22PQ' });

    const order = (await adminFirestore.collection('orders').get()).docs[0].data();
    expect(order.payment.mpesaReceiptNumber).toBe('TXY9KL22PQ');
  });

  /**
   * Regression: a disabled WhatsApp integration must not fail a paid order.
   *
   * `completeOrder` states its own discipline repeatedly — nothing past
   * order creation may undo a paid, confirmed order — and every call in
   * it honoured that except the two WhatsApp ones, purely by omission.
   * In production that surfaced as "Could not reach the server" in Admin
   * for an order that had in fact been created, so the same cash payment
   * was recorded twice.
   */
  it('still creates the order when WhatsApp is switched off', async () => {
    mockAllProviders();
    const { packageId, pickupStationId } = await seededIds();

    class DisabledWhatsAppGateway extends FakeWhatsAppGateway {
      async sendMessage(): Promise<{ providerMessageId: string }> {
        throw new Error(
          'The whatchimp integration for business snack-quest has been disabled in Admin > Settings > Integrations.',
        );
      }
    }

    const service = (() => { const g = new DisabledWhatsAppGateway(); return new ConversationService(g, g); })();

    // The decisive assertion: this resolves rather than throwing. Before
    // the fix the IntegrationDisabledError propagated out of
    // startWebCheckout and became a 500 in Admin.
    const result = await service.startWebCheckout(SNACK_QUEST.businessId, {
      packageId,
      quantity: 1,
      customerName: 'Wanjiru Kamau',
      phone: PHONE,
      county: 'Nairobi',
      deliveryMethod: 'pickup',
      pickupStationId,
      initiatedBy: { staffUid: RECORDER.recordedByUid, staffName: RECORDER.recordedByName },
      manualPayment: { ...RECORDER, method: 'cash', reference: null, note: null },
    });

    expect(result.stkPushSent).toBe(false);

    const orders = await adminFirestore.collection('orders').get();
    expect(orders.size).toBe(1);
    expect(orders.docs[0].data().status).toBe('confirmed');
  });

  it('runs the whole downstream path: stock reserved, shipment created, customer confirmed', async () => {
    mockAllProviders();
    // The seeded box has no `stockCount` at all (unlimited), so a real
    // count is set first — otherwise "stock was reserved" would pass
    // against a box that never tracked stock in the first place.
    const { packageId } = await seededIds();
    await packageRepository.update(packageId, { stockCount: 5 }, 'system');

    const { gateway } = await takePaidOrder({ method: 'cash', reference: null });

    expect((await packageRepository.findById(SNACK_QUEST.businessId, packageId))?.stockCount).toBe(4);

    const shipments = await adminFirestore.collection('shipments').get();
    expect(shipments.size).toBe(1);

    expect(gateway.sent.some((message) => message.text.includes('Payment received!'))).toBe(true);
  });

  /** No prompt is coming, so promising one would be a lie. */
  it('does not tell the customer an M-Pesa prompt is on its way', async () => {
    mockAllProviders();

    const { gateway } = await takePaidOrder({ method: 'cash', reference: null });

    expect(gateway.sent.some((message) => message.text.includes('An M-Pesa prompt is on its way'))).toBe(false);
  });

  /** "Receipt: ." would be worse than saying nothing. */
  it('omits the receipt clause from the confirmation when there is no receipt', async () => {
    mockAllProviders();

    const { gateway } = await takePaidOrder({ method: 'cash', reference: null });

    const confirmation = gateway.sent.find((message) => message.text.includes('Payment received!'));
    expect(confirmation?.text).not.toContain('Receipt:');
  });

  it('still reserves stock atomically, refusing an out-of-stock box', async () => {
    mockAllProviders();
    const { packageId } = await seededIds();
    await packageRepository.update(packageId, { stockCount: 0 }, 'system');

    await expect(takePaidOrder({ method: 'cash', reference: null })).rejects.toThrow();

    expect((await adminFirestore.collection('orders').get()).size).toBe(0);
  });
});
