import { beforeEach, describe, expect, it } from 'vitest';
import { notificationTemplateRepository } from '@/repositories/notificationTemplateRepository';
import { adminFirestore } from '@/lib/firebase/admin';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('notificationTemplates'));
});

describe('notificationTemplateRepository', () => {
  it('returns null for a template code that has never been seeded', async () => {
    expect(await notificationTemplateRepository.findByCode('does_not_exist')).toBeNull();
  });

  it('upserts a template and finds it back by templateCode (the doc id)', async () => {
    await notificationTemplateRepository.upsert({
      templateCode: 'withdrawal_paid_sms',
      channel: 'sms',
      subject: null,
      bodyTemplate: 'Your withdrawal of KES {{amountKes}} has been paid.',
      htmlBodyTemplate: null,
      requiredParams: ['amountKes'],
      version: 1,
      isActive: true,
    });

    const found = await notificationTemplateRepository.findByCode('withdrawal_paid_sms');
    expect(found).toEqual({
      templateCode: 'withdrawal_paid_sms',
      channel: 'sms',
      subject: null,
      bodyTemplate: 'Your withdrawal of KES {{amountKes}} has been paid.',
      htmlBodyTemplate: null,
      requiredParams: ['amountKes'],
      version: 1,
      isActive: true,
    });
  });

  it('overwrites the prior version on a re-upsert of the same templateCode', async () => {
    await notificationTemplateRepository.upsert({
      templateCode: 'withdrawal_paid_sms',
      channel: 'sms',
      subject: null,
      bodyTemplate: 'v1 body',
      htmlBodyTemplate: null,
      requiredParams: [],
      version: 1,
      isActive: true,
    });
    await notificationTemplateRepository.upsert({
      templateCode: 'withdrawal_paid_sms',
      channel: 'sms',
      subject: null,
      bodyTemplate: 'v2 body',
      htmlBodyTemplate: null,
      requiredParams: [],
      version: 2,
      isActive: true,
    });

    const found = await notificationTemplateRepository.findByCode('withdrawal_paid_sms');
    expect(found?.bodyTemplate).toBe('v2 body');
    expect(found?.version).toBe(2);
  });
});
