import { beforeEach, describe, expect, it } from 'vitest';
import { notificationRepository } from '@/repositories/notificationRepository';
import { adminFirestore } from '@/lib/firebase/admin';

const BUSINESS_ID = 'biz-notification-repo-test';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('notifications'));
});

describe('notificationRepository', () => {
  it('creates a notification defaulting read to false', async () => {
    const id = await notificationRepository.create({
      businessId: BUSINESS_ID,
      recipientId: 'creator-1',
      recipientType: 'creator',
      channel: 'in_app',
      templateCode: 'referral_commission_earned_sms',
      payload: { commissionKes: '500' },
    });

    const [entry] = await notificationRepository.listForRecipient('creator-1');
    expect(entry.id).toBe(id);
    expect(entry.data.read).toBe(false);
    expect(entry.data.payload).toEqual({ commissionKes: '500' });
  });

  it('lists only the given recipient\'s notifications, most recent first', async () => {
    await notificationRepository.create({
      businessId: BUSINESS_ID,
      recipientId: 'creator-1',
      recipientType: 'creator',
      channel: 'in_app',
      templateCode: 'tpl-a',
      payload: {},
    });
    await notificationRepository.create({
      businessId: BUSINESS_ID,
      recipientId: 'creator-2',
      recipientType: 'creator',
      channel: 'in_app',
      templateCode: 'tpl-b',
      payload: {},
    });
    await notificationRepository.create({
      businessId: BUSINESS_ID,
      recipientId: 'creator-1',
      recipientType: 'creator',
      channel: 'in_app',
      templateCode: 'tpl-c',
      payload: {},
    });

    const entries = await notificationRepository.listForRecipient('creator-1');
    expect(entries.map((e) => e.data.templateCode)).toEqual(['tpl-c', 'tpl-a']);
  });

  it('markRead flips read to true only when the requester owns the notification', async () => {
    const id = await notificationRepository.create({
      businessId: BUSINESS_ID,
      recipientId: 'creator-1',
      recipientType: 'creator',
      channel: 'in_app',
      templateCode: 'tpl-a',
      payload: {},
    });

    await notificationRepository.markRead(id, 'creator-2');
    let entries = await notificationRepository.listForRecipient('creator-1');
    expect(entries[0].data.read).toBe(false);

    await notificationRepository.markRead(id, 'creator-1');
    entries = await notificationRepository.listForRecipient('creator-1');
    expect(entries[0].data.read).toBe(true);
  });
});
