import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { publishEvent } from '@/lib/events/eventBus';
import { domainEventRepository } from '@/repositories/domainEventRepository';

const BUSINESS_ID = 'biz-domain-event-repo-test';
const OTHER_BUSINESS_ID = 'biz-domain-event-repo-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('domainEvents'));
});

describe('DomainEventRepository.listRecentFailures', () => {
  it('returns only curated failure-flavored event types, not ordinary lifecycle events', async () => {
    await publishEvent(BUSINESS_ID, 'ConversationStarted', 'conversation', 'conv-1', {});
    await publishEvent(BUSINESS_ID, 'ShipmentCreationFailed', 'order', 'order-1', { reason: 'Jumia API down' });
    await publishEvent(BUSINESS_ID, 'ReferralAwardFailed', 'order', 'order-2', { reason: 'creator not found' });

    const failures = await domainEventRepository.listRecentFailures(BUSINESS_ID);
    expect(failures).toHaveLength(2);
    expect(failures.map((f) => f.data.type).sort()).toEqual(['ReferralAwardFailed', 'ShipmentCreationFailed']);
  });

  it('never leaks another business\'s failures', async () => {
    await publishEvent(OTHER_BUSINESS_ID, 'WithdrawalFailed', 'withdrawal', 'w-1', { reason: 'B2C error' });

    const failures = await domainEventRepository.listRecentFailures(BUSINESS_ID);
    expect(failures).toHaveLength(0);
  });
});
