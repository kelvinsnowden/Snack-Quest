import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { ConversationService } from '@/services/conversationService';
import { paymentService } from '@/services/paymentService';
import { conversationRepository } from '@/repositories/conversationRepository';
import { conversationCheckoutSnapshotRepository } from '@/repositories/conversationCheckoutSnapshotRepository';
import { packageRepository } from '@/repositories/packageRepository';
import type { WhatsAppGateway, WhatsAppSendResult } from '@/lib/integrations/types';

/**
 * The vertical-slice proof: a customer can go from a first WhatsApp
 * message all the way to a confirmed, paid order — the exact question
 * PLATFORM_ARCHITECTURE_V2.md's roadmap says the implementation should
 * be measured against, not "how many repositories/services exist."
 *
 * WhatsApp send is faked (records what would have been sent, no real
 * network); Daraja is exercised for real (real gateway code, mocked
 * HTTP transport) — the same mocking discipline as
 * `darajaGateway.test.ts`, just driven end-to-end through the
 * conversation instead of in isolation.
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

const DARAJA_ENV = {
  DARAJA_CONSUMER_KEY: 'test-key',
  DARAJA_CONSUMER_SECRET: 'test-secret',
  DARAJA_SHORTCODE: '174379',
  DARAJA_PASSKEY: 'test-passkey',
  DARAJA_CALLBACK_URL: 'https://example.com/api/webhooks/daraja',
};

const PHONE = '254712345678';
const CHECKOUT_REQUEST_ID = 'e2e-checkout-1';
const MERCHANT_REQUEST_ID = 'e2e-merchant-1';

async function cleanCollections() {
  for (const name of [
    'packages',
    'conversations',
    'conversationCheckoutSnapshots',
    'paymentIntents',
    'webhookEvents',
    'domainEvents',
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
  for (const [key, value] of Object.entries(DARAJA_ENV)) {
    process.env[key] = value;
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(DARAJA_ENV)) {
    delete process.env[key];
  }
});

describe('the full customer journey: WhatsApp message to confirmed paid order', () => {
  it('walks a customer from first contact through payment success', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(
              JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }),
              { status: 200 },
            )
          : new Response(
              JSON.stringify({
                MerchantRequestID: MERCHANT_REQUEST_ID,
                CheckoutRequestID: CHECKOUT_REQUEST_ID,
                ResponseCode: '0',
                ResponseDescription: 'Success. Request accepted for processing',
                CustomerMessage: 'Success. Request accepted for processing',
              }),
              { status: 200 },
            ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway);

    // 1. Customer taps "Order on WhatsApp" — first inbound message.
    const start = await service.start(PHONE, { text: 'Hi, I want to order' });
    expect(gateway.sent[0].text).toContain('Starter Box');
    expect(gateway.sent[0].text).toContain('Deluxe Box');

    let record = await conversationRepository.findActiveByPhoneNumber(PHONE);
    expect(record?.conversation.currentStep).toBe('awaiting_package_selection');
    expect(start.conversationId).toBe(record?.id);

    // 2. Selects the Starter Box (index 1).
    await service.start(PHONE, { text: '1' });
    record = await conversationRepository.findActiveByPhoneNumber(PHONE);
    expect(record?.conversation.stateBlob.packageLabel).toBe('Starter Box');
    expect(record?.conversation.stateBlob.priceKes).toBe(2500);
    expect(record?.conversation.currentStep).toBe('awaiting_customer_details');

    // 3. Provides name + county (Nairobi -> door delivery eligible).
    await service.start(PHONE, { text: 'Jane Doe, Nairobi' });
    record = await conversationRepository.findActiveByPhoneNumber(PHONE);
    expect(record?.conversation.currentStep).toBe('awaiting_delivery_selection');
    expect(gateway.sent.at(-1)?.text).toContain('Door Delivery');

    // 4. Chooses door delivery.
    await service.start(PHONE, { text: '1' });
    record = await conversationRepository.findActiveByPhoneNumber(PHONE);
    expect(record?.conversation.stateBlob.deliveryMethod).toBe('door_delivery');
    expect(record?.conversation.currentStep).toBe('awaiting_referral_code');

    // 5. No referral code.
    await service.start(PHONE, { text: 'no' });
    record = await conversationRepository.findActiveByPhoneNumber(PHONE);
    expect(record?.conversation.currentStep).toBe('awaiting_order_confirmation');
    expect(gateway.sent.at(-1)?.text).toContain('Order summary');

    // 6. Confirms — freezes the snapshot and triggers the real STK push.
    await service.start(PHONE, { text: 'yes' });
    record = await conversationRepository.findActiveByPhoneNumber(PHONE);
    expect(record?.conversation.status).toBe('awaiting_payment');
    expect(record?.conversation.currentStep).toBe('awaiting_payment_confirmation');

    const snapshotId = record?.conversation.conversationCheckoutSnapshotId;
    expect(snapshotId).toBeTruthy();
    const snapshot = await conversationCheckoutSnapshotRepository.findById(snapshotId!);
    expect(snapshot?.totalKes).toBe(2500);
    expect(snapshot?.status).toBe('ready');

    // Real Daraja STK push happened (mocked transport, real gateway code).
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 7. Daraja calls back — payment succeeded.
    const callbackPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: MERCHANT_REQUEST_ID,
          CheckoutRequestID: CHECKOUT_REQUEST_ID,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 2500 },
              { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
              { Name: 'TransactionDate', Value: 20240115120000 },
              { Name: 'PhoneNumber', Value: Number(PHONE) },
            ],
          },
        },
      },
    };

    const result = await paymentService.processCallback(callbackPayload);
    expect(result.status).toBe('succeeded');
    await service.handlePaymentResult(result);

    // 8. The order is confirmed, end to end.
    record = await conversationRepository.findActiveByPhoneNumber(PHONE);
    // No longer "active" (completed isn't in ACTIVE_STATUSES) — look up directly.
    const finalConversation = await conversationRepository.findById(start.conversationId);
    expect(finalConversation?.status).toBe('completed');
    expect(finalConversation?.currentStep).toBe('completed');

    const finalSnapshot = await conversationCheckoutSnapshotRepository.findById(snapshotId!);
    expect(finalSnapshot?.status).toBe('completed');

    expect(gateway.sent.at(-1)?.text).toContain('Payment received');
    expect(gateway.sent.at(-1)?.text).toContain('NLJ7RT61SV');
  });

  it('rejects a duplicate Daraja callback delivery without reprocessing', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/oauth/v1/generate')
          ? new Response(
              JSON.stringify({ access_token: 'token-abc', expires_in: '3599' }),
              { status: 200 },
            )
          : new Response(
              JSON.stringify({
                MerchantRequestID: MERCHANT_REQUEST_ID,
                CheckoutRequestID: CHECKOUT_REQUEST_ID,
                ResponseCode: '0',
                ResponseDescription: 'Success. Request accepted for processing',
                CustomerMessage: 'Success. Request accepted for processing',
              }),
              { status: 200 },
            ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const gateway = new FakeWhatsAppGateway();
    const service = new ConversationService(gateway);

    await service.start(PHONE, { text: 'hi' });
    await service.start(PHONE, { text: '1' });
    await service.start(PHONE, { text: 'Jane Doe, Nairobi' });
    await service.start(PHONE, { text: '1' });
    await service.start(PHONE, { text: 'no' });
    await service.start(PHONE, { text: 'yes' });

    const callbackPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: MERCHANT_REQUEST_ID,
          CheckoutRequestID: CHECKOUT_REQUEST_ID,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 2500 },
              { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
              { Name: 'TransactionDate', Value: 20240115120000 },
              { Name: 'PhoneNumber', Value: Number(PHONE) },
            ],
          },
        },
      },
    };

    const first = await paymentService.processCallback(callbackPayload);
    expect(first.status).toBe('succeeded');

    const second = await paymentService.processCallback(callbackPayload);
    expect(second.status).toBe('duplicate');
  });
});
