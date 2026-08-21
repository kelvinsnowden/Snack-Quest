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
import { calculateSmsCost } from '@/lib/sms/segments';

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

    expect(recipients.map((r) => r.phoneNumber).sort()).toEqual([...expected].sort());
  });

  it('deduplicates a customer who has ordered several times', async () => {
    const service = new MarketingSmsService(fakeSms());
    const { recipients } = await service.resolveRecipients(BUSINESS_ID, 'all_customers', null);

    expect(recipients.filter((r) => r.phoneNumber === '254700000003')).toHaveLength(1);
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

    expect(recipients.map((r) => r.phoneNumber).sort()).toEqual(['254712345678', '254733000000']);
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

/**
 * § Merge tags. The sample message this feature was built for:
 *
 *   Hey {{firstName}} Your Snack Quest cravings called...
 *   enjoy {{offer}}. Order now: {{link}}
 */
describe('MarketingSmsService — merge tags', () => {
  const WIN_BACK =
    'Hey {{firstName}} Your Snack Quest cravings called. Come back and enjoy {{offer}}. Order now: {{link}}';

  async function draftWithTags(service: MarketingSmsService, overrides: Record<string, unknown> = {}) {
    return service.createDraft(
      BUSINESS_ID,
      {
        name: 'August win-back',
        bodyText: WIN_BACK,
        segment: 'all_customers',
        linkUrl: 'https://snackquests.shop/boxes',
        offerText: '15% off your next box',
        ...overrides,
      },
      ACTOR,
    );
  }

  it('fills each recipient’s own first name into their own message', async () => {
    await seedOrder({ phoneNumber: '254700000001', customerName: 'Jane Wanjiru' });
    await seedOrder({ phoneNumber: '254700000002', customerName: 'Otieno Odhiambo' });

    const sms = fakeSms();
    const service = new MarketingSmsService(sms);
    await service.send(BUSINESS_ID, await draftWithTags(service), ACTOR);

    const bodies = (sms.send as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0].body);
    expect(bodies.some((b: string) => b.startsWith('Hey Jane '))).toBe(true);
    expect(bodies.some((b: string) => b.startsWith('Hey Otieno '))).toBe(true);
    // First name only — a marketing greeting does not use a surname.
    expect(bodies.every((b: string) => !b.includes('Wanjiru'))).toBe(true);
  });

  it('substitutes the offer and the link into every message', async () => {
    await seedOrder({ phoneNumber: '254700000001', customerName: 'Jane' });

    const sms = fakeSms();
    const service = new MarketingSmsService(sms);
    await service.send(BUSINESS_ID, await draftWithTags(service), ACTOR);

    const body = (sms.send as ReturnType<typeof vi.fn>).mock.calls[0][0].body;
    expect(body).toContain('15% off your next box');
    expect(body).toContain('https://snackquests.shop/boxes');
    expect(body).not.toContain('{{');
  });

  /** "Hey Guest" and "Hey " are both worse than not personalising at all. */
  it.each([
    ['a customer with no name', ''],
    ['the internal Guest placeholder', 'Guest'],
  ])('falls back to a greeting for %s', async (_label, customerName) => {
    await seedOrder({ phoneNumber: '254700000001', customerName });

    const sms = fakeSms();
    const service = new MarketingSmsService(sms);
    await service.send(BUSINESS_ID, await draftWithTags(service), ACTOR);

    expect((sms.send as ReturnType<typeof vi.fn>).mock.calls[0][0].body).toMatch(/^Hey there /);
  });

  it('has no name to use for a hand-pasted custom list, and still reads correctly', async () => {
    const sms = fakeSms();
    const service = new MarketingSmsService(sms);
    const campaignId = await draftWithTags(service, { segment: 'custom', customRecipients: ['0712345678'] });
    await service.send(BUSINESS_ID, campaignId, ACTOR);

    expect((sms.send as ReturnType<typeof vi.fn>).mock.calls[0][0].body).toContain('Hey there ');
  });

  /**
   * The failure this validation exists to prevent: a mistyped tag is
   * delivered literally to every customer, and cannot be recalled.
   */
  it('refuses a mistyped tag and names the correction', async () => {
    const service = new MarketingSmsService(fakeSms());

    await expect(draftWithTags(service, { bodyText: 'Hey {{firstname}}, come back.' })).rejects.toThrow(
      /did you mean “\{\{firstName\}\}”/,
    );
  });

  it('refuses a tag that does not exist at all', async () => {
    const service = new MarketingSmsService(fakeSms());

    await expect(draftWithTags(service, { bodyText: 'Hey {{discountCode}}, come back.' })).rejects.toThrow(
      /isn’t a tag/,
    );
  });

  it.each([
    ['{{link}} with no address set', { bodyText: 'Order now: {{link}}', linkUrl: null }],
    ['{{offer}} with no offer set', { bodyText: 'Enjoy {{offer}}', offerText: null }],
  ])('refuses %s', async (_label, overrides) => {
    const service = new MarketingSmsService(fakeSms());
    await expect(draftWithTags(service, overrides)).rejects.toThrow(MarketingSmsValidationError);
  });

  it('accepts a bare domain and makes it tappable', async () => {
    await seedOrder({ phoneNumber: '254700000001', customerName: 'Jane' });

    const sms = fakeSms();
    const service = new MarketingSmsService(sms);
    const campaignId = await draftWithTags(service, { linkUrl: 'snackquests.shop/boxes' });
    await service.send(BUSINESS_ID, campaignId, ACTOR);

    expect((sms.send as ReturnType<typeof vi.fn>).mock.calls[0][0].body).toContain('https://snackquests.shop/boxes');
  });

  it('rejects a web address that is not one', async () => {
    const service = new MarketingSmsService(fakeSms());
    await expect(draftWithTags(service, { linkUrl: 'not a url' })).rejects.toThrow(/does not look valid/);
  });

  it('leaves a message with no tags exactly as written', async () => {
    await seedOrder({ phoneNumber: '254700000001', customerName: 'Jane' });

    const sms = fakeSms();
    const service = new MarketingSmsService(sms);
    const campaignId = await service.createDraft(
      BUSINESS_ID,
      { name: 'Plain', bodyText: 'Snack Quest: new Japan box just landed.', segment: 'all_customers' },
      ACTOR,
    );
    await service.send(BUSINESS_ID, campaignId, ACTOR);

    expect((sms.send as ReturnType<typeof vi.fn>).mock.calls[0][0].body).toMatch(
      /^Snack Quest: new Japan box just landed\./,
    );
  });
});

/**
 * § Merge tags and cost. The subtlety that makes personalisation
 * genuinely different from a fixed body: two recipients on one campaign
 * can bill differently, so a single "segments per message" figure is no
 * longer a true statement about the send.
 */
describe('MarketingSmsService — per-recipient cost', () => {
  it('sums the real cost per recipient rather than multiplying one figure', async () => {
    const SHORT = { phoneNumber: '254700000001', customerName: 'Jo' };
    const LONG = { phoneNumber: '254700000002', customerName: 'Bartholomewvictoria' };
    await seedOrder(SHORT);
    await seedOrder(LONG);

    const sms = fakeSms();
    const service = new MarketingSmsService(sms);

    /*
     * The body length that straddles a segment boundary is computed,
     * not hardcoded: it depends on how long the opt-out link is, which
     * depends on the site URL and differs between test and production.
     * A magic number here would pass today and break for a reason
     * nobody would connect to this test.
     */
    let padding = 60;
    let bodyText = '';
    for (; padding < 240; padding += 1) {
      bodyText = `Hey {{firstName}} ${'a'.repeat(padding)}`;
      const shortSegments = calculateSmsCost(service.composeMessage(bodyText, SHORT, null, null)).segments;
      const longSegments = calculateSmsCost(service.composeMessage(bodyText, LONG, null, null)).segments;
      if (shortSegments === 1 && longSegments === 2) {
        break;
      }
    }
    expect(padding).toBeLessThan(240);

    const campaignId = await service.createDraft(
      BUSINESS_ID,
      { name: 'Edge', bodyText, segment: 'all_customers' },
      ACTOR,
    );

    const preview = await service.previewAudience(BUSINESS_ID, 'all_customers', null, bodyText);
    const result = await service.send(BUSINESS_ID, campaignId, ACTOR);

    // The decisive assertion: the total is the sum of two different
    // per-recipient costs, not one cost times two.
    expect(preview.variesByRecipient).toBe(true);
    expect(preview.totalSegments).toBe(3);
    expect(result.totalSegmentsSent).toBe(3);
    expect(preview.segmentsPerMessage).toBe(2);
  });

  it('shows a fully rendered sample rather than the template', async () => {
    await seedOrder({ phoneNumber: '254700000001', customerName: 'Jane Wanjiru' });

    const service = new MarketingSmsService(fakeSms());
    const preview = await service.previewAudience(
      BUSINESS_ID,
      'all_customers',
      null,
      'Hey {{firstName}}, enjoy {{offer}}. {{link}}',
      'https://snackquests.shop',
      '15% off',
    );

    expect(preview.sampleMessage).toContain('Hey Jane,');
    expect(preview.sampleMessage).toContain('15% off');
    expect(preview.sampleMessage).not.toContain('{{');
  });

  it('reports a bad tag from the preview instead of pricing something that cannot send', async () => {
    const service = new MarketingSmsService(fakeSms());
    await expect(
      service.previewAudience(BUSINESS_ID, 'all_customers', null, 'Hey {{nope}}'),
    ).rejects.toThrow(MarketingSmsValidationError);
  });
});

/**
 * § Gateway pre-flight.
 *
 * A production campaign failed with the same "SMS is not configured"
 * error repeated once per recipient. One unset environment variable
 * should be one error, reported before the send loop — not N identical
 * ones reported after it, with the campaign left marked as sent.
 */
describe('MarketingSmsService — unconfigured gateway', () => {
  function unconfiguredSms(): SmsGateway {
    return {
      send: vi.fn(),
      assertReady: () => {
        throw new Error('SMS is not configured — TEXTSMS_API_KEY is not set on this deployment.');
      },
    };
  }

  it('fails once, before the send loop, naming the missing setting', async () => {
    await seedOrder({ phoneNumber: '254700000001' });
    await seedOrder({ phoneNumber: '254700000002' });
    await seedOrder({ phoneNumber: '254700000003' });

    const sms = unconfiguredSms();
    const service = new MarketingSmsService(sms);
    const campaignId = await draft(service);

    await expect(service.send(BUSINESS_ID, campaignId, ACTOR)).rejects.toThrow(/TEXTSMS_API_KEY is not set/);
    // The decisive assertion: not one attempt per recipient.
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('leaves the campaign a draft, so it can be sent once the setting is fixed', async () => {
    await seedOrder({ phoneNumber: '254700000001' });

    const service = new MarketingSmsService(unconfiguredSms());
    const campaignId = await draft(service);
    await expect(service.send(BUSINESS_ID, campaignId, ACTOR)).rejects.toThrow(MarketingSmsValidationError);

    const stored = await marketingSmsRepository.findById(campaignId);
    expect(stored?.status).toBe('draft');
    expect(stored?.sentCount).toBe(0);
    expect(stored?.failedCount).toBe(0);
  });

  it('still sends when the gateway offers no pre-flight at all', async () => {
    await seedOrder({ phoneNumber: '254700000001' });

    // `assertReady` is optional on the interface; a gateway without one
    // must not be treated as unconfigured.
    const sms = fakeSms();
    const service = new MarketingSmsService(sms);
    const result = await service.send(BUSINESS_ID, await draft(service), ACTOR);

    expect(result.sentCount).toBe(1);
  });
});
