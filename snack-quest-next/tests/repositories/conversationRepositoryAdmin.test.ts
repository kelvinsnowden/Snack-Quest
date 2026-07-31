import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { conversationRepository } from '@/repositories/conversationRepository';

/** `conversationRepository.listByBusiness` (§ Admin: Conversation monitoring) — scoping, status filtering, and pagination against the real emulator. */

const BUSINESS_ID = 'biz-conversation-repo-admin-test';
const OTHER_BUSINESS_ID = 'biz-conversation-repo-admin-other';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('conversations'));
});

describe('conversationRepository.listByBusiness', () => {
  it('lists only the given business, most-recently-active first', async () => {
    await conversationRepository.create({ businessId: OTHER_BUSINESS_ID, phoneNumber: '254700000099' });
    const first = await conversationRepository.create({ businessId: BUSINESS_ID, phoneNumber: '254700000001' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await conversationRepository.create({ businessId: BUSINESS_ID, phoneNumber: '254700000002' });

    const { conversations, nextCursor } = await conversationRepository.listByBusiness(BUSINESS_ID);

    expect(conversations.map((c) => c.id)).toEqual([second, first]);
    expect(nextCursor).toBeNull();
  });

  it('filters by status', async () => {
    const active = await conversationRepository.create({ businessId: BUSINESS_ID, phoneNumber: '254700000003' });
    const escalated = await conversationRepository.create({ businessId: BUSINESS_ID, phoneNumber: '254700000004' });
    await conversationRepository.update(escalated, { status: 'agent_assigned', assignedAgentId: 'staff-1' });
    expect(active).toBeTruthy();

    const { conversations } = await conversationRepository.listByBusiness(BUSINESS_ID, { status: 'agent_assigned' });

    expect(conversations.map((c) => c.id)).toEqual([escalated]);
  });

  it('paginates with a cursor', async () => {
    for (let i = 0; i < 3; i += 1) {
      await conversationRepository.create({ businessId: BUSINESS_ID, phoneNumber: `25470000001${i}` });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const firstPage = await conversationRepository.listByBusiness(BUSINESS_ID, { limit: 2 });
    expect(firstPage.conversations).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await conversationRepository.listByBusiness(BUSINESS_ID, {
      limit: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.conversations).toHaveLength(1);
  });
});
