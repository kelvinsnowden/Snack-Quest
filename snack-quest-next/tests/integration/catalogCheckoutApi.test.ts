import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessRepository } from '@/repositories/businessRepository';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { pickupStationRepository } from '@/repositories/pickupStationRepository';
import { conversationRepository } from '@/repositories/conversationRepository';
import { conversationService } from '@/services/conversationService';
import { POST as checkoutStartRoute } from '@/app/api/checkout/start/route';
import { POST as checkoutPayRoute } from '@/app/api/checkout/pay/route';
import { POST as whatchimpWebhookRoute } from '@/app/api/webhooks/whatchimp/route';
import type { CheckoutPayResponse, CheckoutStartResponse } from '@/types/checkout';

/**
 * `POST /checkout/start` and `POST /checkout/pay` (§ Product Catalog &
 * Checkout Architecture) end-to-end against the real conversation
 * engine and Firestore emulator — Daraja/Whatchimp HTTP calls mocked,
 * everything else real, same discipline as
 * `tests/integration/conversationJourney.test.ts`. Proves the three
 * things the redesign is actually about: Snack Quest OS re-prices
 * (never trusts a caller-supplied price), no STK push happens from
 * `/checkout/start`, and `/checkout/pay` only ever charges through the
 * exact same PAY pipeline the WhatsApp text path uses.
 */

const BUSINESS_ID = 'biz-catalog-checkout-test';
const PHONE_NUMBER_ID = 'wa-catalog-checkout';
const CUSTOMER_PHONE = '254711223344';
const SHORTCODE = '111222';
const CHECKOUT_API_KEY = 'test-checkout-secret';

async function cleanCollections() {
  for (const name of [
    'businesses',
    'packages',
    'pickupStations',
    'conversations',
    'conversationCheckoutSnapshots',
    'paymentIntents',
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
      return new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), {
        status: 200,
      });
    }
    if (urlStr.includes('/mpesa/stkpush')) {
      if (stkShouldFail) {
        return new Response(JSON.stringify({ errorMessage: 'simulated Daraja outage' }), {
          status: 500,
        });
      }
      return new Response(
        JSON.stringify({
          MerchantRequestID: `merchant-${body.BusinessShortCode}`,
          CheckoutRequestID: `checkout-${body.BusinessShortCode}`,
          ResponseCode: '0',
          ResponseDescription: 'Success. Request accepted for processing',
          CustomerMessage: 'Success. Request accepted for processing',
        }),
        { status: 200 },
      );
    }
    // Customer-facing replies go out as texts now.
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
      name: 'Catalog Checkout Test Biz',
      currency: 'KES',
      whatsappPhoneNumberId: PHONE_NUMBER_ID,
      countyCoverage: [],
      adminWhatsappPhone: '254799999003',
      whatsappCustomerNumber: null,
      status: 'active',
    },
    'system',
  );
  await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
    apiKey: 'wa-key',
    phoneNumberId: PHONE_NUMBER_ID,
  });
  // Customer-facing replies are texts now (§ customer communications
  // move to SMS), so this journey needs an SMS account as much as it
  // needs a WhatsApp one.
  await businessIntegrationSecretRepository.set(BUSINESS_ID, 'textSms', {
    apiKey: 'sms-key',
    partnerId: 'sms-partner',
    senderId: 'SNACKQUEST',
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
  await pickupStationRepository.create(
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
      deliveryFeeKes: 200,
      isActive: true,
      searchTokens: ['naivas', 'cbd', 'nairobi'],
    },
    'system',
  );
}

function startRequest(body: unknown, apiKey: string | null = CHECKOUT_API_KEY): Request {
  return new Request('http://localhost/api/checkout/start', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { 'x-checkout-api-key': apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

function payRequest(body: unknown, apiKey: string | null = CHECKOUT_API_KEY): Request {
  return new Request('http://localhost/api/checkout/pay', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { 'x-checkout-api-key': apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Walks a conversation that already started from a catalog selection through delivery + referral, landing at `awaiting_customer_payment_confirmation`. */
async function walkToPaymentConfirmation() {
  await conversationService.start(BUSINESS_ID, CUSTOMER_PHONE, { text: 'Jane Doe, Nairobi' });
  await conversationService.start(BUSINESS_ID, CUSTOMER_PHONE, { text: '2' }); // Jumia Pickup Station
  await conversationService.start(BUSINESS_ID, CUSTOMER_PHONE, { text: 'CBD' }); // search
  await conversationService.start(BUSINESS_ID, CUSTOMER_PHONE, { text: '1' }); // select the seeded station
  await conversationService.start(BUSINESS_ID, CUSTOMER_PHONE, { text: 'no' }); // no referral code
}

beforeEach(async () => {
  await cleanCollections();
  process.env.WHATCHIMP_CHECKOUT_API_KEY = CHECKOUT_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WHATCHIMP_CHECKOUT_API_KEY;
});

describe('POST /api/checkout/start', () => {
  beforeEach(async () => {
    await seedBusiness();
  });

  it('rejects a missing/wrong shared secret', async () => {
    const response = await checkoutStartRoute(
      startRequest(
        { phoneNumberId: PHONE_NUMBER_ID, customerPhone: CUSTOMER_PHONE, productId: 'anything' },
        'wrong-key',
      ),
    );
    expect(response.status).toBe(401);
  });

  it('404s when no business owns the given phoneNumberId', async () => {
    const response = await checkoutStartRoute(
      startRequest({
        phoneNumberId: 'not-a-real-number',
        customerPhone: CUSTOMER_PHONE,
        productId: 'anything',
      }),
    );
    expect(response.status).toBe(404);
  });

  it('404s for an unknown product', async () => {
    const response = await checkoutStartRoute(
      startRequest({
        phoneNumberId: PHONE_NUMBER_ID,
        customerPhone: CUSTOMER_PHONE,
        productId: 'does-not-exist',
      }),
    );
    expect(response.status).toBe(404);
  });

  it('409s for an inactive product', async () => {
    const packageId = await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Retired Box', description: 'd', priceKes: 2500, isActive: false, imageUrl: null },
      'system',
    );
    const response = await checkoutStartRoute(
      startRequest({ phoneNumberId: PHONE_NUMBER_ID, customerPhone: CUSTOMER_PHONE, productId: packageId }),
    );
    expect(response.status).toBe(409);
  });

  it('409s for an out-of-stock product', async () => {
    const packageId = await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Sold Out Box',
        description: 'd',
        priceKes: 2500,
        isActive: true,
        stockCount: 0,
        imageUrl: null,
      },
      'system',
    );
    const response = await checkoutStartRoute(
      startRequest({ phoneNumberId: PHONE_NUMBER_ID, customerPhone: CUSTOMER_PHONE, productId: packageId }),
    );
    expect(response.status).toBe(409);
  });

  it('creates a conversation priced from Snack Quest OS, never from a caller-supplied amount, and never sends an STK push', async () => {
    mockProviders();
    const packageId = await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Starter Box', description: 'd', priceKes: 2500, isActive: true, imageUrl: null },
      'system',
    );

    const response = await checkoutStartRoute(
      startRequest({
        phoneNumberId: PHONE_NUMBER_ID,
        customerPhone: CUSTOMER_PHONE,
        productId: packageId,
        referralCode: 'FRIEND10',
        creatorAttributionId: 'creator-abc',
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as CheckoutStartResponse;
    expect(body.product).toEqual({ id: packageId, name: 'Starter Box', priceKes: 2500 });
    expect(body.nextStep).toBe('awaiting_customer_details');
    expect(body.checkoutSessionId).toBeTruthy();

    // "the conversation IS the checkout" — checkoutSessionId is the conversationId.
    const conversation = await conversationRepository.findById(body.checkoutSessionId);
    expect(conversation).not.toBeNull();
    expect(conversation?.businessId).toBe(BUSINESS_ID);
    expect(conversation?.phoneNumber).toBe(CUSTOMER_PHONE);
    expect(conversation?.currentStep).toBe('awaiting_customer_details');
    expect(conversation?.stateBlob.packageId).toBe(packageId);
    expect(conversation?.stateBlob.priceKes).toBe(2500); // Snack Quest OS's price, not something the request supplied
    expect(conversation?.stateBlob.referralCode).toBe('FRIEND10'); // pre-filled from attribution
    expect(conversation?.referralLinkId).toBe('creator-abc');
    expect(conversation?.status).not.toBe('awaiting_payment'); // never charges from /checkout/start
  });

  it('rejects a quantity other than 1 — no multi-item cart exists in this codebase', async () => {
    const packageId = await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Starter Box', description: 'd', priceKes: 2500, isActive: true, imageUrl: null },
      'system',
    );
    const response = await checkoutStartRoute(
      startRequest({
        phoneNumberId: PHONE_NUMBER_ID,
        customerPhone: CUSTOMER_PHONE,
        productId: packageId,
        quantity: 2,
      }),
    );
    expect(response.status).toBe(400);
  });
});

describe('POST /api/checkout/pay', () => {
  let packageId: string;

  beforeEach(async () => {
    await seedBusiness();
    await seedPickupStation();
    packageId = await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Starter Box', description: 'd', priceKes: 2500, isActive: true, imageUrl: null },
      'system',
    );
  });

  it('rejects a missing/wrong shared secret', async () => {
    const response = await checkoutPayRoute(payRequest({ checkoutSessionId: 'anything' }, 'wrong-key'));
    expect(response.status).toBe(401);
  });

  it('404s for an unknown checkout session', async () => {
    const response = await checkoutPayRoute(payRequest({ checkoutSessionId: 'does-not-exist' }));
    expect(response.status).toBe(404);
  });

  it('returns status "error" when the session has not reached payment confirmation yet', async () => {
    mockProviders();
    const startResponse = await checkoutStartRoute(
      startRequest({ phoneNumberId: PHONE_NUMBER_ID, customerPhone: CUSTOMER_PHONE, productId: packageId }),
    );
    const { checkoutSessionId } = (await startResponse.json()) as CheckoutStartResponse;

    const response = await checkoutPayRoute(payRequest({ checkoutSessionId }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as CheckoutPayResponse;
    expect(body.status).toBe('error');

    // Still not charged.
    const conversation = await conversationRepository.findById(checkoutSessionId);
    expect(conversation?.status).not.toBe('awaiting_payment');
  });

  it('sends the STK push and freezes the snapshot once the session is at payment confirmation — the only place either checkout path charges', async () => {
    mockProviders();
    const startResponse = await checkoutStartRoute(
      startRequest({ phoneNumberId: PHONE_NUMBER_ID, customerPhone: CUSTOMER_PHONE, productId: packageId }),
    );
    const { checkoutSessionId } = (await startResponse.json()) as CheckoutStartResponse;
    await walkToPaymentConfirmation();

    const before = await conversationRepository.findById(checkoutSessionId);
    expect(before?.currentStep).toBe('awaiting_customer_payment_confirmation');

    const response = await checkoutPayRoute(payRequest({ checkoutSessionId }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as CheckoutPayResponse;
    expect(body.status).toBe('stk_sent');

    const after = await conversationRepository.findById(checkoutSessionId);
    expect(after?.status).toBe('awaiting_payment');
    expect(after?.conversationCheckoutSnapshotId).toBeTruthy();

    const paymentIntents = await adminFirestore.collection('paymentIntents').get();
    expect(paymentIntents.size).toBe(1);
  });

  it('returns status "price_changed" and does not charge when the price drifted since checkout started', async () => {
    mockProviders();
    const startResponse = await checkoutStartRoute(
      startRequest({ phoneNumberId: PHONE_NUMBER_ID, customerPhone: CUSTOMER_PHONE, productId: packageId }),
    );
    const { checkoutSessionId } = (await startResponse.json()) as CheckoutStartResponse;
    await walkToPaymentConfirmation();

    // Simulate a real price change on the master catalog after the quote was given.
    await packageRepository.update(packageId, { priceKes: 3000 }, 'system');

    const response = await checkoutPayRoute(payRequest({ checkoutSessionId }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as CheckoutPayResponse;
    expect(body.status).toBe('price_changed');
    expect(body.message).toContain('3000');

    const after = await conversationRepository.findById(checkoutSessionId);
    expect(after?.status).not.toBe('awaiting_payment'); // never charged the stale price
    expect(after?.currentStep).toBe('awaiting_customer_payment_confirmation');
    expect(after?.stateBlob.priceKes).toBe(3000);

    const paymentIntents = await adminFirestore.collection('paymentIntents').get();
    expect(paymentIntents.empty).toBe(true);
  });

  it('returns status "error" and does not charge when the STK push itself fails', async () => {
    mockProviders({ stkShouldFail: true });
    const startResponse = await checkoutStartRoute(
      startRequest({ phoneNumberId: PHONE_NUMBER_ID, customerPhone: CUSTOMER_PHONE, productId: packageId }),
    );
    const { checkoutSessionId } = (await startResponse.json()) as CheckoutStartResponse;
    await walkToPaymentConfirmation();

    const response = await checkoutPayRoute(payRequest({ checkoutSessionId }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as CheckoutPayResponse;
    expect(body.status).toBe('error');

    const after = await conversationRepository.findById(checkoutSessionId);
    expect(after?.status).not.toBe('awaiting_payment');
    expect(after?.currentStep).toBe('awaiting_customer_payment_confirmation');

    // The intent is created before the STK attempt (so a retry has
    // something to attach to) — it stays 'pending', never 'processing'
    // or 'succeeded', since the actual Daraja call never went through.
    const paymentIntents = await adminFirestore.collection('paymentIntents').get();
    expect(paymentIntents.size).toBe(1);
    expect(paymentIntents.docs[0].data().status).toBe('pending');
  });
});

describe('inbound webhook catalogOrder handling (secondary catalog checkout entry point)', () => {
  beforeEach(async () => {
    await seedBusiness();
  });

  function catalogOrderWebhookPayload(productRetailerId: string, messageId: string) {
    return {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: PHONE_NUMBER_ID },
                messages: [
                  {
                    id: messageId,
                    from: CUSTOMER_PHONE,
                    timestamp: '1700000000',
                    type: 'order',
                    order: {
                      catalog_id: 'catalog-1',
                      product_items: [{ product_retailer_id: productRetailerId, quantity: 1 }],
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  it('starts a catalog checkout from an inbound Product Catalog cart, same as /checkout/start', async () => {
    mockProviders();
    const packageId = await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Starter Box', description: 'd', priceKes: 2500, isActive: true, imageUrl: null },
      'system',
    );

    const response = await whatchimpWebhookRoute(
      new Request('http://localhost/api/webhooks/whatchimp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(catalogOrderWebhookPayload(packageId, 'wamid.catalog-order-1')),
      }),
    );
    expect(response.status).toBe(200);

    const conversation = await conversationRepository.findActiveByPhoneNumber(BUSINESS_ID, CUSTOMER_PHONE);
    expect(conversation?.conversation.currentStep).toBe('awaiting_customer_details');
    expect(conversation?.conversation.stateBlob.packageId).toBe(packageId);
    expect(conversation?.conversation.stateBlob.priceKes).toBe(2500);
  });

  it('marks the webhook event failed (does not crash) when the catalog order references an unavailable product', async () => {
    mockProviders();
    const packageId = await packageRepository.create(
      {
        businessId: BUSINESS_ID,
        name: 'Sold Out Box',
        description: 'd',
        priceKes: 2500,
        isActive: true,
        stockCount: 0,
        imageUrl: null,
      },
      'system',
    );

    const response = await whatchimpWebhookRoute(
      new Request('http://localhost/api/webhooks/whatchimp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(catalogOrderWebhookPayload(packageId, 'wamid.catalog-order-2')),
      }),
    );
    expect(response.status).toBe(200); // still 200 so the provider doesn't retry-storm

    const conversation = await conversationRepository.findActiveByPhoneNumber(BUSINESS_ID, CUSTOMER_PHONE);
    expect(conversation).toBeNull(); // no conversation was started for the rejected product

    const events = await adminFirestore.collection('webhookEvents').get();
    expect(events.docs[0].data().status).toBe('failed');
  });
});
