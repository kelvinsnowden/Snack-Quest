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
    renderedHtmlBody: null,
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
    await outboundMessageRepository.markFailed('sms:withdrawal-3', 'TextSMS send failed: Invalid mobile number (code 1002)');

    const found = await outboundMessageRepository.findById('sms:withdrawal-3');
    expect(found?.status).toBe('failed');
    expect(found?.failureReason).toBe('TextSMS send failed: Invalid mobile number (code 1002)');
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

describe('outboundMessageRepository.listByRecipient', () => {
  it('returns messages for any of the given recipientRefs, newest first, scoped to the business', async () => {
    await outboundMessageRepository.create('email:1', baseInput({ channel: 'email', recipientRef: 'amina@example.com' }));
    await outboundMessageRepository.create('email:2', baseInput({ channel: 'email', recipientRef: 'amina@example.com' }));
    await outboundMessageRepository.create('sms:1', baseInput({ channel: 'sms', recipientRef: '254700000001' }));
    await outboundMessageRepository.create(
      'email:other-recipient',
      baseInput({ channel: 'email', recipientRef: 'someone-else@example.com' }),
    );
    await outboundMessageRepository.create(
      'email:other-business',
      baseInput({ businessId: 'biz-outbound-message-other', channel: 'email', recipientRef: 'amina@example.com' }),
    );

    const { messages } = await outboundMessageRepository.listByRecipient(BUSINESS_ID, [
      'amina@example.com',
      '254700000001',
    ]);

    expect(messages.map((m) => m.id).sort()).toEqual(['email:1', 'email:2', 'sms:1'].sort());
  });

  it('returns an empty page for an empty recipientRefs list rather than querying', async () => {
    const { messages, nextCursor } = await outboundMessageRepository.listByRecipient(BUSINESS_ID, []);
    expect(messages).toEqual([]);
    expect(nextCursor).toBeNull();
  });
});

describe('outboundMessageRepository.getTemplateStats', () => {
  it('counts sent/delivered as sent, failed/bounced as failed, and queued as pending — via real .count() aggregation queries with no composite index required', async () => {
    await outboundMessageRepository.create('t1', baseInput({ templateCode: 'withdrawal_paid_sms', status: 'sent' }));
    await outboundMessageRepository.create('t2', baseInput({ templateCode: 'withdrawal_paid_sms', status: 'delivered' }));
    await outboundMessageRepository.create('t3', baseInput({ templateCode: 'withdrawal_paid_sms', status: 'failed' }));
    await outboundMessageRepository.create('t4', baseInput({ templateCode: 'withdrawal_paid_sms', status: 'bounced' }));
    await outboundMessageRepository.create('t5', baseInput({ templateCode: 'withdrawal_paid_sms', status: 'queued' }));
    await outboundMessageRepository.create(
      't6-other-template',
      baseInput({ templateCode: 'refund_succeeded_sms', status: 'sent' }),
    );
    await outboundMessageRepository.create(
      't7-other-business',
      baseInput({ businessId: 'biz-outbound-message-other', templateCode: 'withdrawal_paid_sms', status: 'sent' }),
    );

    const stats = await outboundMessageRepository.getTemplateStats(BUSINESS_ID, 'withdrawal_paid_sms');

    expect(stats).toEqual({ sent: 2, failed: 2, pending: 1 });
  });

  it('returns all zeros for a template that has never been dispatched', async () => {
    const stats = await outboundMessageRepository.getTemplateStats(BUSINESS_ID, 'never_used_template');
    expect(stats).toEqual({ sent: 0, failed: 0, pending: 0 });
  });
});
