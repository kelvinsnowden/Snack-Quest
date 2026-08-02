import { beforeEach, describe, expect, it } from 'vitest';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
import { adminFirestore } from '@/lib/firebase/admin';

const BUSINESS_ID = 'biz-outbound-message-test';

function baseInput(overrides: Partial<Parameters<typeof outboundMessageRepository.create>[1]> = {}) {
  return {
    businessId: BUSINESS_ID,
    notificationId: null,
    channel: 'sms' as const,
    templateCode: 'withdrawal_paid_sms',
    recipientRef: '254700000000',
    renderedSubject: null,
    renderedBody: 'Your withdrawal of KES 500 has been paid.',
    providerMessageId: null,
    status: 'queued' as const,
    failureReason: null,
    sentAt: null,
    deliveredAt: null,
    retryCount: 0,
    ...overrides,
  };
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('outboundMessages'));
});

describe('outboundMessageRepository.create', () => {
  it('creates a new outbound message and reports created: true', async () => {
    const result = await outboundMessageRepository.create('sms:withdrawal-1', baseInput());
    expect(result).toEqual({ created: true });

    const found = await outboundMessageRepository.findById('sms:withdrawal-1');
    expect(found?.status).toBe('queued');
    expect(found?.retryCount).toBe(0);
  });

  it('reports created: false on a duplicate id, without overwriting the original', async () => {
    await outboundMessageRepository.create('sms:withdrawal-1', baseInput());
    const second = await outboundMessageRepository.create(
      'sms:withdrawal-1',
      baseInput({ renderedBody: 'a different body' }),
    );

    expect(second).toEqual({ created: false });
    const found = await outboundMessageRepository.findById('sms:withdrawal-1');
    expect(found?.renderedBody).toBe('Your withdrawal of KES 500 has been paid.');
  });
});

describe('outboundMessageRepository status transitions', () => {
  it('markSent sets status, providerMessageId, sentAt, and clears failureReason', async () => {
    await outboundMessageRepository.create('sms:withdrawal-2', baseInput({ status: 'failed', failureReason: 'prior failure' }));
    await outboundMessageRepository.markSent('sms:withdrawal-2', 'at-msg-123');

    const found = await outboundMessageRepository.findById('sms:withdrawal-2');
    expect(found?.status).toBe('sent');
    expect(found?.providerMessageId).toBe('at-msg-123');
    expect(found?.failureReason).toBeNull();
    expect(found?.sentAt).not.toBeNull();
  });

  it('markFailed sets status and failureReason', async () => {
    await outboundMessageRepository.create('sms:withdrawal-3', baseInput());
    await outboundMessageRepository.markFailed('sms:withdrawal-3', 'Africa\'s Talking send failed: InvalidPhoneNumber');

    const found = await outboundMessageRepository.findById('sms:withdrawal-3');
    expect(found?.status).toBe('failed');
    expect(found?.failureReason).toBe("Africa's Talking send failed: InvalidPhoneNumber");
  });

  it('incrementRetryCount bumps retryCount by one each call', async () => {
    await outboundMessageRepository.create('sms:withdrawal-4', baseInput());
    await outboundMessageRepository.incrementRetryCount('sms:withdrawal-4');
    await outboundMessageRepository.incrementRetryCount('sms:withdrawal-4');

    const found = await outboundMessageRepository.findById('sms:withdrawal-4');
    expect(found?.retryCount).toBe(2);
  });
});

describe('outboundMessageRepository.listRetryable', () => {
  it('returns only failed messages below the retry ceiling, scoped to the business', async () => {
    await outboundMessageRepository.create('sms:below-ceiling', baseInput({ status: 'failed', retryCount: 2 }));
    await outboundMessageRepository.create('sms:at-ceiling', baseInput({ status: 'failed', retryCount: 5 }));
    await outboundMessageRepository.create('sms:queued', baseInput({ status: 'queued', retryCount: 0 }));
    await outboundMessageRepository.create(
      'sms:other-business',
      baseInput({ businessId: 'biz-outbound-message-other', status: 'failed', retryCount: 0 }),
    );

    const retryable = await outboundMessageRepository.listRetryable(BUSINESS_ID, 5);

    expect(retryable.map((r) => r.id)).toEqual(['sms:below-ceiling']);
  });
});
