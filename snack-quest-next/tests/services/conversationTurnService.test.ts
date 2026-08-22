import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessRepository } from '@/repositories/businessRepository';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { packageRepository } from '@/repositories/packageRepository';
import { pickupStationRepository } from '@/repositories/pickupStationRepository';
import { conversationRepository } from '@/repositories/conversationRepository';
import { createConversationTurnProcessor } from '@/services/conversationTurnService';
import { FakeWhatsAppGateway } from '../helpers/fakeWhatsAppGateway';

/**
 * The channel-agnostic conversation engine (§ WhatChimp Integration
 * Redesign, Phase 2) against the real free-text state machine and
 * Firestore emulator — proves a full checkout journey works end to
 * end driven purely by raw text turns (exactly what a maximally-dumb
 * WhatChimp Flow can forward), and that every customer-facing reply
 * is captured/returned rather than sent through the Gateway, while
 * genuinely-internal side effects (the admin door-delivery ping)
 * still fire for real.
 */

const BUSINESS_ID = 'biz-turn-engine-test';
const PHONE_NUMBER_ID = 'wa-turn-engine-test';
const CUSTOMER_PHONE = '254733445566';
const SHORTCODE = '555666';

async function cleanCollections() {
  for (const name of [
    'businesses',
    'packages',
    'pickupStations',
    'conversations',
    'conversationCheckoutSnapshots',
    'paymentIntents',
    'domainEvents',
  ]) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(name));
  }
}

function mockDaraja() {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const urlStr = String(url);
    if (urlStr.includes('/oauth/v1/generate')) {
      return new Response(JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }), { status: 200 });
    }
    if (urlStr.includes('/mpesa/stkpush')) {
      return new Response(
        JSON.stringify({
          MerchantRequestID: `merchant-${SHORTCODE}`,
          CheckoutRequestID: `checkout-${Date.now()}-${Math.random()}`,
          ResponseCode: '0',
          ResponseDescription: 'Success. Request accepted for processing',
          CustomerMessage: 'Success. Request accepted for processing',
        }),
        { status: 200 },
      );
    }
    throw new Error(`Unmocked fetch call in conversationTurnService test: ${urlStr}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function seedBusiness() {
  await businessRepository.create(
    BUSINESS_ID,
    {
      name: 'Turn Engine Test Biz',
      currency: 'KES',
      whatsappPhoneNumberId: PHONE_NUMBER_ID,
      countyCoverage: [],
      adminWhatsappPhone: '254799999005',
      whatsappCustomerNumber: null,
      status: 'active',
    },
    'system',
  );
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

beforeEach(async () => {
  await cleanCollections();
});

describe('conversationTurnService — channel-agnostic engine', () => {
  it('runs a full pickup checkout journey from raw text turns alone, never touching the Gateway for customer replies', async () => {
    mockDaraja();
    await seedBusiness();
    await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Starter Box', description: 'd', priceKes: 2600, isActive: true, imageUrl: null },
      'system',
    );
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
        deliveryFeeKes: 250,
        isActive: true,
        searchTokens: ['naivas', 'cbd', 'nairobi'],
      },
      'system',
    );

    const gateway = new FakeWhatsAppGateway();
    const processTurn = createConversationTurnProcessor(gateway);
    const turn = (text: string) =>
      processTurn({ businessId: BUSINESS_ID, channel: 'whatsapp', externalUserId: CUSTOMER_PHONE, text });

    const welcome = await turn('hi');
    expect(welcome.nextStep).toBe('awaiting_package_selection');
    expect(welcome.messages).toHaveLength(1);
    expect(welcome.messageText).toContain('Welcome to Snack Quest');
    const conversationId = welcome.conversationId;

    const pkg = await turn('1');
    expect(pkg.nextStep).toBe('awaiting_customer_details');
    expect(pkg.conversationId).toBe(conversationId);

    const details = await turn('Jane Doe, Nairobi');
    expect(details.nextStep).toBe('awaiting_delivery_selection');

    // Nairobi order: [1: door, 2: pickup].
    const delivery = await turn('2');
    expect(delivery.nextStep).toBe('awaiting_pickup_station_selection');

    const search = await turn('CBD');
    expect(search.nextStep).toBe('awaiting_pickup_station_selection');
    expect(search.messageText).toContain('Naivas CBD Station');

    const stationSelect = await turn('1');
    expect(stationSelect.nextStep).toBe('awaiting_referral_code');

    const referral = await turn('no');
    expect(referral.nextStep).toBe('awaiting_customer_payment_confirmation');
    expect(referral.messageText).toContain('Total: KES 2850'); // 2600 + 250 delivery

    const pay = await turn('PAY');
    expect(pay.nextStep).toBe('awaiting_payment_confirmation');
    expect(pay.messages).toEqual(['Sending your M-Pesa payment prompt now — check your phone.']);

    const conversation = await conversationRepository.findById(conversationId);
    expect(conversation?.status).toBe('awaiting_payment');
    expect(conversation?.conversationCheckoutSnapshotId).toBeTruthy();

    const intents = await adminFirestore.collection('paymentIntents').get();
    expect(intents.size).toBe(1);

    // The whole point of the engine: every customer-facing reply across
    // the entire journey was captured and handed back, never actually
    // sent — no admin escalation happened on this pickup path either, so
    // the Gateway should have recorded nothing at all.
    expect(gateway.sent).toHaveLength(0);
  });

  it('captures the door-delivery escalation message for the caller to render, while still really pinging the admin', async () => {
    await seedBusiness();
    await packageRepository.create(
      { businessId: BUSINESS_ID, name: 'Starter Box', description: 'd', priceKes: 2600, isActive: true, imageUrl: null },
      'system',
    );

    const gateway = new FakeWhatsAppGateway();
    const processTurn = createConversationTurnProcessor(gateway);
    const turn = (text: string) =>
      processTurn({ businessId: BUSINESS_ID, channel: 'whatsapp', externalUserId: CUSTOMER_PHONE, text });

    await turn('hi');
    await turn('1');
    await turn('Jane Doe, Nairobi');
    const doorChoice = await turn('1'); // Nairobi: 1 = door
    expect(doorChoice.nextStep).toBe('awaiting_door_delivery_details');

    const escalated = await turn('123 Ngong Road, near ABC Bank, Kilimani, 254733445566');
    expect(escalated.nextStep).toBe('awaiting_agent_pricing');
    expect(escalated.messages).toHaveLength(1);
    expect(escalated.messageText).toContain('Door delivery within Nairobi is handled by Bolt');

    const conversation = await conversationRepository.findById(escalated.conversationId);
    expect(conversation?.status).toBe('agent_assigned');
    expect(conversation?.escalationReason).toBe('door_delivery_price_confirmation');

    // The customer-facing escalation message above was captured, not
    // sent — but the admin ping is a genuinely internal side effect
    // that must still fire for real regardless of channel/transport.
    expect(gateway.sent).toHaveLength(1);
    expect(gateway.sent[0].phone).toBe('254799999005');
    expect(gateway.sent[0].text).toContain('Door delivery needs price confirmation');
  });

  it('returns no messages for a conversation already handed to a human agent, without erroring', async () => {
    await seedBusiness();
    const conversationId = await conversationRepository.create({ businessId: BUSINESS_ID, phoneNumber: CUSTOMER_PHONE });
    await conversationRepository.update(conversationId, { status: 'agent_assigned', assignedAgentId: 'staff-1' });

    const gateway = new FakeWhatsAppGateway();
    const processTurn = createConversationTurnProcessor(gateway);

    const result = await processTurn({
      businessId: BUSINESS_ID,
      channel: 'whatsapp',
      externalUserId: CUSTOMER_PHONE,
      text: 'is anyone there?',
    });

    expect(result.conversationId).toBe(conversationId);
    expect(result.messages).toEqual([]);
    expect(result.messageText).toBe('');
    expect(gateway.sent).toHaveLength(0);
  });
});
