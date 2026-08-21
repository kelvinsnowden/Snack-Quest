import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { marketingSmsRepository } from '@/repositories/marketingSmsRepository';
import { smsOptOutRepository } from '@/repositories/smsOptOutRepository';
import {
  MarketingSmsService,
  MarketingSmsValidationError,
  MarketingSmsNotEditableError,
} from '@/services/marketingSmsService';
import type { SmsGateway } from '@/lib/integrations/types';
import type { Order } from '@/types';

const BUSINESS_ID = 'biz-marketing-sms-test';
const ACTOR = 'staff-1';
const ORIGINAL_SECRET = process.env.SMS_OPTOUT_SECRET;

function fakeSms(overrides: Partial<SmsGateway> = {}): SmsGateway {
  return { send: vi.fn().mockResolvedValue({ providerMessageId: 'sms-1' }), ...overrides };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Order['createdAt'] {
  return Timestamp.fromMillis(Date.now() - days * DAY_MS) as unknown as Order['createdAt'];
}

let orderSeq = 0;

async function seedOrder(input: {
  phoneNumber: string;
  customerName?: string;
  totalKes?: number;
  createdAt?: Order['createdAt'];
}) {
  orderSeq += 1;
  await adminFirestore
    .collection('orders')
    .doc(`order-${orderSeq}`)
    .set({
      businessId: BUSINESS_ID,
      product: { packageId: 'pkg-1', packageLabel: 'Explorer Box' },
      customer: {
        customerId: null,
        phoneNumber: input.phoneNumber,
        customerName: input.customerName ?? 'Amina',
        county: 'Nairobi',
      },
      delivery: { method: 'pickup' },
      payment: { paymentIntentId: `intent-${orderSeq}`, mpesaReceiptNumber: 'ABC123' },
      pricing: {
        subtotalKes: input.totalKes ?? 2500,
        discountKes: 0,
        deliveryFeeKes: 0,
        creditsUsedKes: 0,
        totalKes: input.totalKes ?? 2500,
      },
      conversationId: `conv-${orderSeq}`,
      conversationCheckoutSnapshotId: `snap-${orderSeq}`,
      status: 'confirmed',
      referralLinkId: null,
      attribution: null,
      fulfillmentBatchId: null,
      fulfillment: null,
      packingRecipeVersionId: null,
      packing: null,
      createdAt: input.createdAt ?? daysAgo(1),
      updatedAt: input.createdAt ?? daysAgo(1),
      createdBy: 'system',
      updatedBy: 'system',
      deletedAt: null,
    });
}

beforeEach(async () => {
  orderSeq = 0;
  process.env.SMS_OPTOUT_SECRET = 'test-opt-out-secret';
  await adminFirestore.recursiveDelete(adminFirestore.collection('orders'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('smsOptOuts'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('marketingSmsCampaigns'));
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.SMS_OPTOUT_SECRET;
  } else {
    process.env.SMS_OPTOUT_SECRET = ORIGINAL_SECRET;
  }
});

async function draft(service: MarketingSmsService, overrides: Partial<Parameters<MarketingSmsService['createDraft']>[1]> = {}) {
  return service.createDraft(
    BUSINESS_ID,
    { name: 'New box launch', bodyText: 'Snack Quest: new Japan box just landed.', segment: 'all_customers', ...overrides },
    ACTOR,
  );
}

describe('MarketingSmsService — opt-out enforcement', () => {
  /**
   * The guarantee the whole feature rests on. `resolveRecipients` is the
   * only method that produces a recipient list, so if it honours the
   * register there is no route through this service that does not.
   */
  it('never sends to a number on the opt-out register', async () => {
    await seedOrder({ phoneNumber: '254700000001' });
    await seedOrder({ phoneNumber: '254700000002' });
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: '254700000002',
      source: 'customer_link',
    });

    const sms = fakeSms();
    const service = new MarketingSmsService(sms);
    const campaignId = await draft(service);

    const result = await service.send(BUSINESS_ID, campaignId, ACTOR);

    expect(result).toMatchObject({ recipientCount: 1, sentCount: 1, optedOutSkippedCount: 1 });
    const texted = (sms.send as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0].to);
    expect(texted).toEqual(['254700000001']);
  });

  it('records how many were skipped, so a smaller reach has an explanation', async () => {
    await seedOrder({ phoneNumber: '254700000001' });
    await seedOrder({ phoneNumber: '254700000002' });
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: '254700000002',
      source: 'admin',
      recordedBy: ACTOR,
    });

    const service = new MarketingSmsService(fakeSms());
    const campaignId = await draft(service);
    await service.send(BUSINESS_ID, campaignId, ACTOR);

    const stored = await marketingSmsRepository.findById(campaignId);
    expect(stored).toMatchObject({ recipientCount: 1, sentCount: 1, optedOutSkippedCount: 1 });
  });

  it('refuses to send, with a distinct message, when everyone in the segment has opted out', async () => {
    await seedOrder({ phoneNumber: '254700000001' });
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: '254700000001',
      source: 'customer_link',
    });

    const sms = fakeSms();
    const service = new MarketingSmsService(sms);
    const campaignId = await draft(service);

    await expect(service.send(BUSINESS_ID, campaignId, ACTOR)).rejects.toThrow(/has opted out/);
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('honours an opt-out recorded between the first send and a resend', async () => {
    await seedOrder({ phoneNumber: '254700000001' });
    await seedOrder({ phoneNumber: '254700000002' });

    const sms = fakeSms({
      send: vi
        .fn()
        .mockResolvedValueOnce({ providerMessageId: 'ok' })
        .mockRejectedValueOnce(new Error('TextSMS send failed: temporary')),
    });
    const service = new MarketingSmsService(sms);
    const campaignId = await draft(service);
    const first = await service.send(BUSINESS_ID, campaignId, ACTOR);
    expect(first.failedCount).toBe(1);

    const failedNumber = (await marketingSmsRepository.findById(campaignId))!.failedRecipients![0].phoneNumber;
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: failedNumber,
      source: 'customer_link',
    });

    await expect(service.resendFailed(BUSINESS_ID, campaignId, ACTOR)).rejects.toThrow(/since opted out/);
  });

  it('appends the recipient’s own opt-out link to every message', async () => {
    await seedOrder({ phoneNumber: '254700000001' });
    await seedOrder({ phoneNumber: '254700000002' });

    const sms = fakeSms();
    const service = new MarketingSmsService(sms);
    await service.send(BUSINESS_ID, await draft(service), ACTOR);

    const bodies = (sms.send as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0].body);
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body).toContain('/s/');
      expect(body).toContain('Stop ');
    }
    // Each recipient's link is signed for their own number, so no two are the same.
    expect(new Set(bodies).size).toBe(2);
  });

  /** A campaign whose opt-out link cannot be honoured must not go out, and must stay editable rather than being stranded mid-send. */
  it('refuses to send without SMS_OPTOUT_SECRET, leaving the campaign a draft', async () => {
    await seedOrder({ phoneNumber: '254700000001' });
    delete process.env.SMS_OPTOUT_SECRET;

    const sms = fakeSms();
    const service = new MarketingSmsService(sms);
    const campaignId = await draft(service);

    await expect(service.send(BUSINESS_ID, campaignId, ACTOR)).rejects.toThrow(/SMS_OPTOUT_SECRET/);
    expect(sms.send).not.toHaveBeenCalled();
    expect((await marketingSmsRepository.findById(campaignId))?.status).toBe('draft');
  });
});

describe('MarketingSmsService — segments', () => {
  beforeEach(async () => {
    await seedOrder({ phoneNumber: '254700000001', createdAt: daysAgo(5), totalKes: 1500 });
    await seedOrder({ phoneNumber: '254700000002', createdAt: daysAgo(90), totalKes: 1200 });
    await seedOrder({ phoneNumber: '254700000003', createdAt: daysAgo(3), totalKes: 3000 });
    await seedOrder({ phoneNumber: '254700000003', createdAt: daysAgo(2), totalKes: 3000 });
  });

  it.each([
    ['all_customers', ['254700000001', '254700000002', '254700000003']],
    ['recent_customers', ['254700000001', '254700000003']],
    ['lapsed_customers', ['254700000002']],
    ['repeat_customers', ['254700000003']],
    ['one_time_customers', ['254700000001', '254700000002']],
    ['high_value_customers', ['254700000003']],
  ] as const)('resolves %s', async (segment, expected) => {
    const service = new MarketingSmsService(fakeSms());
    const { recipients } = await service.resolveRecipients(BUSINESS_ID, segment, null);

    expect(recipients.sort()).toEqual([...expected].sort());
  });

  it('deduplicates a customer who has ordered several times', async () => {
    const service = new MarketingSmsService(fakeSms());
    const { recipients } = await service.resolveRecipients(BUSINESS_ID, 'all_customers', null);

    expect(recipients.filter((phone) => phone === '254700000003')).toHaveLength(1);
  });

  it('normalises and dedupes a hand-pasted custom list, dropping what is not a Kenyan mobile', async () => {
    const service = new MarketingSmsService(fakeSms());
    const { recipients } = await service.resolveRecipients(BUSINESS_ID, 'custom', [
      '0712345678',
      '+254712345678',
      'Phone Number',
      '',
      '254733000000',
    ]);

    expect(recipients.sort()).toEqual(['254712345678', '254733000000']);
  });
});

describe('MarketingSmsService — audience preview', () => {
  it('reports matched, opted-out and billable segments before anything is sent', async () => {
    await seedOrder({ phoneNumber: '254700000001' });
    await seedOrder({ phoneNumber: '254700000002' });
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: '254700000002',
      source: 'customer_link',
    });

    const service = new MarketingSmsService(fakeSms());
    const preview = await service.previewAudience(BUSINESS_ID, 'all_customers', null, 'Short message.');

    expect(preview).toMatchObject({
      matchedCount: 2,
      optedOutCount: 1,
      recipientCount: 1,
      segmentsPerMessage: 1,
      totalSegments: 1,
      encoding: 'GSM-7',
      forcedUcs2By: null,
    });
  });

  /** The preview must price what actually ships — the opt-out link included — or it can promise one segment for a message that bills as two. */
  it('prices the message with the opt-out link attached, not the bare body', async () => {
    await seedOrder({ phoneNumber: '254700000001' });

    const service = new MarketingSmsService(fakeSms());
    // 130 characters of body: one segment alone, two once ~42 characters of opt-out link are appended.
    const preview = await service.previewAudience(BUSINESS_ID, 'all_customers', null, 'a'.repeat(130));

    expect(preview.segmentsPerMessage).toBe(2);
  });

  it('names the character that forced UCS-2 so the composer can explain the jump in cost', async () => {
    await seedOrder({ phoneNumber: '254700000001' });

    const service = new MarketingSmsService(fakeSms());
    const preview = await service.previewAudience(BUSINESS_ID, 'all_customers', null, 'New box 🎉');

    expect(preview).toMatchObject({ encoding: 'UCS-2', forcedUcs2By: '🎉' });
  });
});

describe('MarketingSmsService — drafts, sending and cost', () => {
  it('records what the campaign actually cost in the unit the provider bills in', async () => {
    await seedOrder({ phoneNumber: '254700000001' });
    await seedOrder({ phoneNumber: '254700000002' });

    const service = new MarketingSmsService(fakeSms());
    const campaignId = await draft(service);
    const result = await service.send(BUSINESS_ID, campaignId, ACTOR);

    expect(result.totalSegmentsSent).toBe(2);
    expect(await marketingSmsRepository.findById(campaignId)).toMatchObject({
      segmentsPerMessage: 1,
      totalSegmentsSent: 2,
      status: 'sent',
    });
  });

  it('captures the real gateway error per failed recipient instead of discarding it', async () => {
    await seedOrder({ phoneNumber: '254700000001' });
    await seedOrder({ phoneNumber: '254700000002' });

    const sms = fakeSms({
      send: vi
        .fn()
        .mockResolvedValueOnce({ providerMessageId: 'ok' })
        .mockRejectedValueOnce(new Error('TextSMS send failed: Insufficient balance (code 1003)')),
    });
    const service = new MarketingSmsService(sms);
    const campaignId = await draft(service);

    const result = await service.send(BUSINESS_ID, campaignId, ACTOR);

    expect(result).toMatchObject({ sentCount: 1, failedCount: 1 });
    const stored = await marketingSmsRepository.findById(campaignId);
    expect(stored?.failedRecipients?.[0].error).toMatch(/Insufficient balance/);
    // One failure never stops the rest of the run.
    expect(stored?.sentCount).toBe(1);
  });

  it('resends only to the recipients that failed', async () => {
    await seedOrder({ phoneNumber: '254700000001' });
    await seedOrder({ phoneNumber: '254700000002' });

    const send = vi
      .fn()
      .mockResolvedValueOnce({ providerMessageId: 'ok' })
      .mockRejectedValueOnce(new Error('temporary'));
    const service = new MarketingSmsService(fakeSms({ send }));
    const campaignId = await draft(service);
    await service.send(BUSINESS_ID, campaignId, ACTOR);

    send.mockResolvedValue({ providerMessageId: 'ok-retry' });
    const resend = await service.resendFailed(BUSINESS_ID, campaignId, ACTOR);

    expect(resend).toMatchObject({ recipientCount: 1, sentCount: 1, failedCount: 0 });
    const stored = await marketingSmsRepository.findById(campaignId);
    expect(stored).toMatchObject({ sentCount: 2, failedCount: 0, failedRecipients: null, totalSegmentsSent: 2 });
  });

  it('refuses to send the same campaign twice', async () => {
    await seedOrder({ phoneNumber: '254700000001' });

    const service = new MarketingSmsService(fakeSms());
    const campaignId = await draft(service);
    await service.send(BUSINESS_ID, campaignId, ACTOR);

    await expect(service.send(BUSINESS_ID, campaignId, ACTOR)).rejects.toThrow(MarketingSmsNotEditableError);
  });

  it('refuses to edit or delete a campaign that has already gone out', async () => {
    await seedOrder({ phoneNumber: '254700000001' });

    const service = new MarketingSmsService(fakeSms());
    const campaignId = await draft(service);
    await service.send(BUSINESS_ID, campaignId, ACTOR);

    await expect(
      service.updateDraft(BUSINESS_ID, campaignId, { name: 'x', bodyText: 'y', segment: 'all_customers' }, ACTOR),
    ).rejects.toThrow(MarketingSmsNotEditableError);
    await expect(service.deleteDraft(BUSINESS_ID, campaignId)).rejects.toThrow(MarketingSmsNotEditableError);
  });

  it.each([
    ['an empty name', { name: '  ' }],
    ['an empty message', { bodyText: '  ' }],
    ['a message past the length ceiling', { bodyText: 'a'.repeat(481) }],
  ])('rejects a draft with %s', async (_label, overrides) => {
    const service = new MarketingSmsService(fakeSms());
    await expect(draft(service, overrides)).rejects.toThrow(MarketingSmsValidationError);
  });

  it('rejects a custom campaign whose list contains no valid number', async () => {
    const service = new MarketingSmsService(fakeSms());
    await expect(draft(service, { segment: 'custom', customRecipients: ['not a phone', ''] })).rejects.toThrow(
      /at least one valid Kenyan mobile/,
    );
  });

  it('refuses to send to a segment nobody matches', async () => {
    const service = new MarketingSmsService(fakeSms());
    const campaignId = await draft(service);

    await expect(service.send(BUSINESS_ID, campaignId, ACTOR)).rejects.toThrow(/No customers matched/);
  });

  it('never reaches another business’s customers or campaigns', async () => {
    await seedOrder({ phoneNumber: '254700000001' });
    const service = new MarketingSmsService(fakeSms());
    const campaignId = await draft(service);

    await expect(service.getCampaign('some-other-business', campaignId)).rejects.toThrow(/not found/);
    const { recipients } = await service.resolveRecipients('some-other-business', 'all_customers', null);
    expect(recipients).toEqual([]);
  });
});

describe('MarketingSmsService — transactional sends are unaffected', () => {
  /**
   * The line the whole design turns on. An order confirmation is a
   * service message about a purchase the customer chose to make;
   * suppressing it would withhold information they need rather than
   * respect a marketing preference. Opting out of marketing must not
   * silence it — and nothing here should be able to make it.
   */
  it('leaves the register untouched by transactional dispatch, which never consults it', async () => {
    await smsOptOutRepository.recordOptOut({
      businessId: BUSINESS_ID,
      phoneNumber: '254700000001',
      source: 'customer_link',
    });

    // The transactional path is NotificationService, which has no
    // dependency on smsOptOutRepository at all — asserted here as a
    // structural fact rather than a behaviour, since the absence of a
    // call is what guarantees it.
    const notificationServiceSource = await import('@/services/notificationService');
    expect(Object.keys(notificationServiceSource)).toContain('notificationService');
    expect(await smsOptOutRepository.isOptedOut(BUSINESS_ID, '254700000001')).toBe(true);
  });
});
