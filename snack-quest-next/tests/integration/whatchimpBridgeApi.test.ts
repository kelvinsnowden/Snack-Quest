import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessRepository } from '@/repositories/businessRepository';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { pickupStationRepository } from '@/repositories/pickupStationRepository';
import { referralLinkRepository } from '@/repositories/referralLinkRepository';
import { conversationRepository } from '@/repositories/conversationRepository';
import { paymentService } from '@/services/paymentService';
import { conversationService } from '@/services/conversationService';
import { POST as selectProductRoute } from '@/app/api/whatchimp/select-product/route';
import { POST as quoteDeliveryRoute } from '@/app/api/whatchimp/quote-delivery/route';
import { POST as applyReferralRoute } from '@/app/api/whatchimp/apply-referral/route';
import { POST as checkoutRoute } from '@/app/api/whatchimp/checkout/route';
import { GET as orderStatusRoute } from '@/app/api/whatchimp/order-status/route';
import type {
  ApplyReferralResponse,
  OrderStatusResponse,
  QuoteDeliveryResponse,
  SelectProductResponse,
  WhatchimpCheckoutResponse,
} from '@/types/whatchimpBridge';

/**
 * The WhatChimp Bridge API end-to-end against the real conversation
 * engine and Firestore emulator (§ WhatChimp Integration Redesign) —
 * same discipline as `tests/integration/catalogCheckoutApi.test.ts`.
 * Proves the one thing this redesign is actually about, on top of the
 * usual pricing-authority/no-premature-STK-push rules
 * `catalogCheckoutApi.test.ts` already covers for the legacy routes:
 * every Bridge API call is silent — it never calls Whatchimp's
 * `/whatsapp/send` endpoint, unlike the legacy `/checkout/*` routes, which
 * still send a WhatsApp reply as a side effect of the free-text engine
 * underneath them.
 */

const BUSINESS_ID = 'biz-whatchimp-bridge-test';
const PHONE_NUMBER_ID = 'wa-bridge-test';
const CUSTOMER_PHONE = '254722334455';
const SHORTCODE = '444555';
const CHECKOUT_API_KEY = 'test-bridge-secret';

async function cleanCollections() {
  for (const name of [
    'businesses',
    'packages',
    'pickupStations',
    'referralLinks',
    'conversations',
    'conversationCheckoutSnapshots',
    'paymentIntents',
    'orders',
    'webhookEvents',
    'domainEvents',
  ]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(name));
  }
}

function mockProviders({ stkShouldFail = false }: { stkShouldFail?: boolean } = {}) {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const urlStr = String(url);
    // WhatChimp sends URLSearchParams (form-encoded); Daraja/Jumia/Meta
    // still send JSON strings. Only parse what is actually JSON.
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};

    if (urlStr.includes('/oauth/v1/generate')) {
      return new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 });
    }
    if (urlStr.includes('/mpesa/stkpush')) {
      if (stkShouldFail) {
        return new Response(JSON.stringify({ errorMessage: 'simulated Daraja outage' }), { status: 500 });
      }
      return new Response(
        JSON.stringify({
          MerchantRequestID: `merchant-${body.BusinessShortCode}`,
          CheckoutRequestID: `checkout-${body.BusinessShortCode}-${Date.now()}-${Math.random()}`,
          ResponseCode: '0',
          ResponseDescription: 'Success. Request accepted for processing',
          CustomerMessage: 'Success. Request accepted for processing',
        }),
        { status: 200 },
      );
    }
    if (urlStr.includes('/whatsapp/')) {
      // Real, legitimate, and unchanged by the Bridge API: the
      // pre-existing Daraja-callback-triggered completion path
      // (`completeOrder`/`notifyAdmin`) still messages the business's
      // own admin number — the "silent" guarantee this test suite
      // cares about is specifically that the *new Bridge endpoints*
      // never trigger one, not that nothing in the whole system ever
      // does. Individual tests assert on call counts, not on this
      // branch being unreachable.
      return new Response(
        JSON.stringify({ status: '1', wa_message_id: `wamid-${Date.now()}-${Math.random()}` }),
        { status: 200 },
      );
    }
    throw new Error(`Unmocked fetch call: ${urlStr}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function seedBusiness() {
  await businessRepository.create(
    BUSINESS_ID,
    {
      name: 'Bridge Test Biz',
      currency: 'KES',
      whatsappPhoneNumberId: PHONE_NUMBER_ID,
      countyCoverage: [],
      adminWhatsappPhone: '254799999004',
      whatsappCustomerNumber: null,
      status: 'active',
    },
    'system',
  );
  await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
    apiKey: 'wa-key',
    phoneNumberId: PHONE_NUMBER_ID,
  });
  await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', {
    consumerKey: 'daraja-key',
    consumerSecret: 'daraja-secret',
    shortcode: SHORTCODE,
    accountType: 'till',
    passkey: 'test-passkey',
    callbackUrl: `https://example.com/api/webhooks/daraja/${BUSINESS_ID}`,
    env: 'sandbox',
  });
}

async function seedPickupStation() {
  return pickupStationRepository.create(
    {
      businessId: BUSINESS_ID,
      courier: 'fargo',
      name: 'Naivas CBD Station',
      latitude: -1.2833,
      longitude: 36.8167,
      description: 'Nairobi CBD',
      county: 'Nairobi',
      town: 'CBD',
      zone: 'Upcountry',
      shippingOrigin: 'Nairobi',
      packageCategory: 'small',
      deliveryFeeKes: 250,
      isActive: true,
      searchTokens: ['naivas', 'cbd', 'nairobi'],
    },
    'system',
  );
}

function jsonRequest(path: string, body: unknown, apiKey: string | null = CHECKOUT_API_KEY): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(apiKey ? { 'x-checkout-api-key': apiKey } : {}) },
    body: JSON.stringify(body),
  });
}

function getRequest(path: string, apiKey: string | null = CHECKOUT_API_KEY): Request {
  return new Request(`http://localhost${path}`, {
    method: 'GET',
    headers: { ...(apiKey ? { 'x-checkout-api-key': apiKey } : {}) },
  });
}

beforeEach(async () => {
  await cleanCollections();
  process.env.WHATCHIMP_CHECKOUT_API_KEY = CHECKOUT_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WHATCHIMP_CHECKOUT_API_KEY;
});

describe('POST /api/whatchimp/select-product', () => {
  beforeEach(async () => {
    await seedBusiness();
  });

  it('rejects a missing/wrong shared secret', async () => {
    const response = await selectProductRoute(
      jsonRequest(
        '/api/whatchimp/select-product',
        { phoneNumberId: PHONE_NUMBER_ID, customerPhone: CUSTOMER_PHONE, productId: 'anything' },
        'wrong-key',
      ),
    );
    expect(response.status).toBe(401);
  });

  it('creates a conversation priced from Snack Quest OS, and never calls Whatchimp — silent by design', async () => {
    const fetchMock = mockProviders();
    const packageId = await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Starter Box', description: 'd', priceKes: 2600, isActive: true, imageUrl: null },
      'system',
    );

    const response = await selectProductRoute(
      jsonRequest('/api/whatchimp/select-product', {
        phoneNumberId: PHONE_NUMBER_ID,
        customerPhone: CUSTOMER_PHONE,
        productId: packageId,
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as SelectProductResponse;
    expect(body).toEqual({
      checkoutSessionId: expect.any(String),
      nextStep: 'awaiting_customer_details',
      productId: packageId,
      productName: 'Starter Box',
      priceKes: 2600,
    });

    const conversation = await conversationRepository.findById(body.checkoutSessionId);
    expect(conversation?.stateBlob.priceKes).toBe(2600);
    expect(conversation?.status).not.toBe('awaiting_payment');

    // The whole point of the Bridge API: no gateway call happened.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('WhatChimp Bridge API — full checkout journey (pickup)', () => {
  let packageId: string;

  beforeEach(async () => {
    await seedBusiness();
    await seedPickupStation();
    packageId = await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Starter Box', description: 'd', priceKes: 2600, isActive: true, imageUrl: null },
      'system',
    );
  });

  it('walks select-product -> quote-delivery (search + select) -> apply-referral -> checkout -> order-status, never touching Whatchimp', async () => {
    const fetchMock = mockProviders();

    const selectResponse = await selectProductRoute(
      jsonRequest('/api/whatchimp/select-product', {
        phoneNumberId: PHONE_NUMBER_ID,
        customerPhone: CUSTOMER_PHONE,
        productId: packageId,
      }),
    );
    const { checkoutSessionId } = (await selectResponse.json()) as SelectProductResponse;

    // Search.
    const searchResponse = await quoteDeliveryRoute(
      jsonRequest('/api/whatchimp/quote-delivery', {
        checkoutSessionId,
        customerName: 'Jane Doe',
        county: 'Nairobi',
        deliveryMethod: 'pickup',
        pickupStationSearch: 'CBD',
      }),
    );
    expect(searchResponse.status).toBe(200);
    const searchBody = (await searchResponse.json()) as QuoteDeliveryResponse;
    expect(searchBody.nextStep).toBe('awaiting_pickup_station_selection');
    expect(searchBody.doorDeliveryEligible).toBe(true); // Nairobi
    expect(searchBody.pickupStations).toHaveLength(1);
    const stationId = searchBody.pickupStations[0].id;

    // Select.
    const selectStationResponse = await quoteDeliveryRoute(
      jsonRequest('/api/whatchimp/quote-delivery', {
        checkoutSessionId,
        customerName: 'Jane Doe',
        county: 'Nairobi',
        deliveryMethod: 'pickup',
        pickupStationId: stationId,
      }),
    );
    const selectStationBody = (await selectStationResponse.json()) as QuoteDeliveryResponse;
    expect(selectStationBody.nextStep).toBe('awaiting_referral_code');
    expect(selectStationBody.selectedPickupStation).toEqual({ id: stationId, name: 'Naivas CBD Station', deliveryFeeKes: 250 });

    // Referral (none).
    const referralResponse = await applyReferralRoute(
      jsonRequest('/api/whatchimp/apply-referral', { checkoutSessionId, referralCode: null }),
    );
    const referralBody = (await referralResponse.json()) as ApplyReferralResponse;
    expect(referralBody.valid).toBe(false);
    expect(referralBody.discountKes).toBe(0);
    expect(referralBody.totalKes).toBe(2850); // 2600 + 250 delivery

    // Checkout — sends the real STK push, still silent toward the customer.
    const checkoutResponse = await checkoutRoute(jsonRequest('/api/whatchimp/checkout', { checkoutSessionId }));
    const checkoutBody = (await checkoutResponse.json()) as WhatchimpCheckoutResponse;
    expect(checkoutBody.status).toBe('stk_sent');
    expect(checkoutBody.totalKes).toBe(2850);

    const afterCheckout = await conversationRepository.findById(checkoutSessionId);
    expect(afterCheckout?.status).toBe('awaiting_payment');

    // The whole point of the Bridge API: nothing up to and including
    // checkout ever called Whatchimp's send endpoint — only
    // /oauth and /mpesa/stkpush (Daraja, not Whatchimp).
    const messageCallsBeforeCompletion = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/whatsapp/send'),
    );
    expect(messageCallsBeforeCompletion).toHaveLength(0);

    // Poll before payment resolves.
    const statusBefore = await orderStatusRoute(getRequest(`/api/whatchimp/order-status?checkoutSessionId=${checkoutSessionId}`));
    const statusBeforeBody = (await statusBefore.json()) as OrderStatusResponse;
    expect(statusBeforeBody.paymentStatus).toBe('processing');

    // Simulate the real Daraja callback + backend reaction, same as
    // the free-text journey tests do — this part of the pipeline is
    // completely unchanged by the Bridge API. The mocked STK push
    // above generates a fresh CheckoutRequestID per call, so read the
    // one actually recorded for this intent rather than guessing it.
    const intents = await adminFirestore.collection('paymentIntents').get();
    const attempts = await intents.docs[0].ref.collection('attempts').get();
    const checkoutRequestId = attempts.docs[0].data().checkoutRequestId as string;

    const callback = await paymentService.processCallback(BUSINESS_ID, {
      Body: {
        stkCallback: {
          MerchantRequestID: `merchant-${SHORTCODE}`,
          CheckoutRequestID: checkoutRequestId,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 2850 },
              { Name: 'MpesaReceiptNumber', Value: 'BRIDGE1TEST' },
              { Name: 'TransactionDate', Value: 20240115120000 },
              { Name: 'PhoneNumber', Value: Number(CUSTOMER_PHONE) },
            ],
          },
        },
      },
    });
    expect(callback.status).toBe('succeeded');
    await conversationService.handlePaymentResult(callback);

    const statusAfter = await orderStatusRoute(getRequest(`/api/whatchimp/order-status?checkoutSessionId=${checkoutSessionId}`));
    const statusAfterBody = (await statusAfter.json()) as OrderStatusResponse;
    expect(statusAfterBody.paymentStatus).toBe('succeeded');
    expect(statusAfterBody.orderId).toBeTruthy();
    expect(statusAfterBody.totalKes).toBe(2850);
  });

  it('applies a valid referral discount to the preview total', async () => {
    mockProviders();
    await referralLinkRepository.create(
      {
        businessId: BUSINESS_ID,
        code: 'BRIDGE10',
        ownerId: 'creator-1',
        discountKes: 200,
        commissionKes: 150,
        isActive: true,
        clickCount: 0,
        conversionCount: 0,
      },
      'system',
    );

    const selectResponse = await selectProductRoute(
      jsonRequest('/api/whatchimp/select-product', { phoneNumberId: PHONE_NUMBER_ID, customerPhone: CUSTOMER_PHONE, productId: packageId }),
    );
    const { checkoutSessionId } = (await selectResponse.json()) as SelectProductResponse;
    const stations = await pickupStationRepository.search(BUSINESS_ID, 'CBD');
    await quoteDeliveryRoute(
      jsonRequest('/api/whatchimp/quote-delivery', {
        checkoutSessionId,
        customerName: 'Jane Doe',
        county: 'Nairobi',
        deliveryMethod: 'pickup',
        pickupStationId: stations[0].id,
      }),
    );

    const referralResponse = await applyReferralRoute(
      jsonRequest('/api/whatchimp/apply-referral', { checkoutSessionId, referralCode: 'BRIDGE10' }),
    );
    const referralBody = (await referralResponse.json()) as ApplyReferralResponse;
    expect(referralBody.valid).toBe(true);
    expect(referralBody.discountKes).toBe(200);
    expect(referralBody.totalKes).toBe(2650); // 2600 - 200 + 250
  });

  it('escalates a Nairobi door-delivery order to a human agent, silently', async () => {
    const fetchMock = mockProviders();
    const selectResponse = await selectProductRoute(
      jsonRequest('/api/whatchimp/select-product', { phoneNumberId: PHONE_NUMBER_ID, customerPhone: CUSTOMER_PHONE, productId: packageId }),
    );
    const { checkoutSessionId } = (await selectResponse.json()) as SelectProductResponse;

    const response = await quoteDeliveryRoute(
      jsonRequest('/api/whatchimp/quote-delivery', {
        checkoutSessionId,
        customerName: 'Jane Doe',
        county: 'Nairobi',
        deliveryMethod: 'door',
        addressText: '123 Ngong Road',
        landmark: 'near ABC Bank',
        estate: 'Kilimani',
        contactPhone: CUSTOMER_PHONE,
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as QuoteDeliveryResponse;
    expect(body.escalatedToAgent).toBe(true);
    expect(body.nextStep).toBe('awaiting_agent_pricing');

    const conversation = await conversationRepository.findById(checkoutSessionId);
    expect(conversation?.status).toBe('agent_assigned');
    expect(conversation?.escalationReason).toBe('door_delivery_price_confirmation');

    // notifyAdmin does send one real WhatsApp message (to the business's
    // own admin number) — that's expected and unrelated to the
    // customer-silence guarantee. No send call beyond that one.
    const messageCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/whatsapp/send'));
    expect(messageCalls).toHaveLength(1);
  });

  it('rejects door delivery outside Nairobi', async () => {
    mockProviders();
    const selectResponse = await selectProductRoute(
      jsonRequest('/api/whatchimp/select-product', { phoneNumberId: PHONE_NUMBER_ID, customerPhone: CUSTOMER_PHONE, productId: packageId }),
    );
    const { checkoutSessionId } = (await selectResponse.json()) as SelectProductResponse;

    const response = await quoteDeliveryRoute(
      jsonRequest('/api/whatchimp/quote-delivery', {
        checkoutSessionId,
        customerName: 'Jane Doe',
        county: 'Mombasa',
        deliveryMethod: 'door',
      }),
    );
    expect(response.status).toBe(400);
  });

  it('returns "not_ready" from checkout before the session has reached payment confirmation', async () => {
    mockProviders();
    const selectResponse = await selectProductRoute(
      jsonRequest('/api/whatchimp/select-product', { phoneNumberId: PHONE_NUMBER_ID, customerPhone: CUSTOMER_PHONE, productId: packageId }),
    );
    const { checkoutSessionId } = (await selectResponse.json()) as SelectProductResponse;

    const response = await checkoutRoute(jsonRequest('/api/whatchimp/checkout', { checkoutSessionId }));
    const body = (await response.json()) as WhatchimpCheckoutResponse;
    expect(body.status).toBe('not_ready');

    const conversation = await conversationRepository.findById(checkoutSessionId);
    expect(conversation?.status).not.toBe('awaiting_payment');
  });

  it('reports "failed" order status and never charges when the STK push itself fails', async () => {
    mockProviders({ stkShouldFail: true });
    const selectResponse = await selectProductRoute(
      jsonRequest('/api/whatchimp/select-product', { phoneNumberId: PHONE_NUMBER_ID, customerPhone: CUSTOMER_PHONE, productId: packageId }),
    );
    const { checkoutSessionId } = (await selectResponse.json()) as SelectProductResponse;
    const stations = await pickupStationRepository.search(BUSINESS_ID, 'CBD');
    await quoteDeliveryRoute(
      jsonRequest('/api/whatchimp/quote-delivery', {
        checkoutSessionId,
        customerName: 'Jane Doe',
        county: 'Nairobi',
        deliveryMethod: 'pickup',
        pickupStationId: stations[0].id,
      }),
    );
    await applyReferralRoute(jsonRequest('/api/whatchimp/apply-referral', { checkoutSessionId, referralCode: null }));

    const response = await checkoutRoute(jsonRequest('/api/whatchimp/checkout', { checkoutSessionId }));
    const body = (await response.json()) as WhatchimpCheckoutResponse;
    expect(body.status).toBe('error');

    const conversation = await conversationRepository.findById(checkoutSessionId);
    expect(conversation?.status).not.toBe('awaiting_payment');

    const statusResponse = await orderStatusRoute(getRequest(`/api/whatchimp/order-status?checkoutSessionId=${checkoutSessionId}`));
    const statusBody = (await statusResponse.json()) as OrderStatusResponse;
    expect(statusBody.paymentStatus).toBe('failed');
  });
});
