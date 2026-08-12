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
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
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
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
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
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
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
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
      htmlBodyTemplate: null,
      requiredParams: [],
      version: 2,
      isActive: true,
    });

    const found = await notificationTemplateRepository.findByCode('withdrawal_paid_sms');
    expect(found?.bodyTemplate).toBe('v2 body');
    expect(found?.version).toBe(2);
  });

  it('listAll returns every seeded template', async () => {
    await notificationTemplateRepository.upsert({
      templateCode: 'withdrawal_paid_sms',
      channel: 'sms',
      subject: null,
      bodyTemplate: 'a',
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
      htmlBodyTemplate: null,
      requiredParams: [],
      version: 1,
      isActive: true,
    });
    await notificationTemplateRepository.upsert({
      templateCode: 'refund_succeeded_sms',
      channel: 'sms',
      subject: null,
      bodyTemplate: 'b',
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
      htmlBodyTemplate: null,
      requiredParams: [],
      version: 1,
      isActive: true,
    });

    const all = await notificationTemplateRepository.listAll();
    expect(all.map((t) => t.templateCode).sort()).toEqual(['refund_succeeded_sms', 'withdrawal_paid_sms']);
  });

  it('update merges partial fields onto the existing doc without clobbering the rest', async () => {
    await notificationTemplateRepository.upsert({
      templateCode: 'withdrawal_paid_sms',
      channel: 'sms',
      subject: null,
      bodyTemplate: 'original',
      heading: null,
      ctaLabel: null,
      ctaUrl: null,
      htmlBodyTemplate: null,
      requiredParams: ['amountKes'],
      version: 1,
      isActive: true,
    });

    await notificationTemplateRepository.update('withdrawal_paid_sms', { bodyTemplate: 'updated', version: 2 });

    const found = await notificationTemplateRepository.findByCode('withdrawal_paid_sms');
    expect(found?.bodyTemplate).toBe('updated');
    expect(found?.version).toBe(2);
    expect(found?.requiredParams).toEqual(['amountKes']);
    expect(found?.channel).toBe('sms');
  });
});
