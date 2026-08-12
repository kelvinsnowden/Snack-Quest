import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { notificationTemplateRepository } from '@/repositories/notificationTemplateRepository';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
import {
  notificationTemplateService,
  NotificationTemplateNotFoundError,
  NotificationTemplateValidationError,
} from '@/services/notificationTemplateService';

const BUSINESS_ID = 'biz-notification-template-service-test';

/**
 * `NotificationTemplateService` (§ Admin: Notification Templates) —
 * real edits against the emulator, proving `htmlBodyTemplate` is
 * always re-derived from the structured fields (never hand-set) and
 * `version` always advances.
 */

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('notificationTemplates'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('outboundMessages'));
  await notificationTemplateRepository.upsert({
    templateCode: 'creator_registered_welcome_email',
    channel: 'email',
    subject: 'Welcome {{displayName}}',
    heading: 'Welcome!',
    bodyTemplate: 'Hi {{displayName}}, your code is {{referralCode}}.',
    ctaLabel: 'Open portal',
    ctaUrl: '{{portalUrl}}',
    htmlBodyTemplate: '<html>stale</html>',
    requiredParams: ['displayName', 'referralCode', 'portalUrl'],
    version: 1,
    isActive: true,
  });
  await notificationTemplateRepository.upsert({
    templateCode: 'withdrawal_paid_sms',
    channel: 'sms',
    subject: null,
    heading: null,
    bodyTemplate: 'Your withdrawal of KES {{amountKes}} has been paid.',
    ctaLabel: null,
    ctaUrl: null,
    htmlBodyTemplate: null,
    requiredParams: ['amountKes'],
    version: 1,
    isActive: true,
  });
});

describe('NotificationTemplateService.getByCode', () => {
  it('throws NotificationTemplateNotFoundError for an unknown code', async () => {
    await expect(notificationTemplateService.getByCode('does_not_exist')).rejects.toBeInstanceOf(
      NotificationTemplateNotFoundError,
    );
  });
});

describe('NotificationTemplateService.listAll', () => {
  it('returns every template, sorted by code', async () => {
    const all = await notificationTemplateService.listAll();
    expect(all.map((t) => t.templateCode)).toEqual(['creator_registered_welcome_email', 'withdrawal_paid_sms']);
  });
});

describe('NotificationTemplateService.updateTemplate — email channel', () => {
  it('re-renders htmlBodyTemplate from the structured fields via the real branded shell, including the logo', async () => {
    await notificationTemplateService.updateTemplate('creator_registered_welcome_email', {
      subject: 'New subject {{displayName}}',
      heading: 'New heading',
      bodyTemplate: 'New body with {{referralCode}}.',
      ctaLabel: 'New CTA',
      ctaUrl: '{{portalUrl}}',
      isActive: true,
    });

    const updated = await notificationTemplateService.getByCode('creator_registered_welcome_email');
    expect(updated.subject).toBe('New subject {{displayName}}');
    expect(updated.heading).toBe('New heading');
    expect(updated.bodyTemplate).toBe('New body with {{referralCode}}.');
    expect(updated.htmlBodyTemplate).toContain('New heading');
    expect(updated.htmlBodyTemplate).toContain('New body with {{referralCode}}.');
    expect(updated.htmlBodyTemplate).toContain('https://www.snackquests.shop/logo.png');
    expect(updated.htmlBodyTemplate).not.toContain('stale');
  });

  it('bumps version on every save', async () => {
    await notificationTemplateService.updateTemplate('creator_registered_welcome_email', {
      subject: 'S',
      heading: 'H',
      bodyTemplate: 'B',
      ctaLabel: null,
      ctaUrl: null,
      isActive: true,
    });
    const updated = await notificationTemplateService.getByCode('creator_registered_welcome_email');
    expect(updated.version).toBe(2);
  });

  it('toggling isActive off leaves content untouched but flips the switch', async () => {
    await notificationTemplateService.updateTemplate('creator_registered_welcome_email', {
      subject: 'Welcome {{displayName}}',
      heading: 'Welcome!',
      bodyTemplate: 'Hi {{displayName}}, your code is {{referralCode}}.',
      ctaLabel: 'Open portal',
      ctaUrl: '{{portalUrl}}',
      isActive: false,
    });
    const updated = await notificationTemplateService.getByCode('creator_registered_welcome_email');
    expect(updated.isActive).toBe(false);
    expect(updated.heading).toBe('Welcome!');
  });

  it('rejects a blank subject for an email template', async () => {
    await expect(
      notificationTemplateService.updateTemplate('creator_registered_welcome_email', {
        subject: '  ',
        heading: 'H',
        bodyTemplate: 'B',
        ctaLabel: null,
        ctaUrl: null,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotificationTemplateValidationError);
  });

  it('rejects a blank heading for an email template', async () => {
    await expect(
      notificationTemplateService.updateTemplate('creator_registered_welcome_email', {
        subject: 'S',
        heading: '  ',
        bodyTemplate: 'B',
        ctaLabel: null,
        ctaUrl: null,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotificationTemplateValidationError);
  });

  it('rejects a CTA label without a URL, or vice versa', async () => {
    await expect(
      notificationTemplateService.updateTemplate('creator_registered_welcome_email', {
        subject: 'S',
        heading: 'H',
        bodyTemplate: 'B',
        ctaLabel: 'Shop',
        ctaUrl: null,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotificationTemplateValidationError);
  });
});

describe('NotificationTemplateService.updateTemplate — non-email channel', () => {
  it('edits bodyTemplate and leaves htmlBodyTemplate null — no shell to render for SMS', async () => {
    await notificationTemplateService.updateTemplate('withdrawal_paid_sms', {
      subject: null,
      heading: null,
      bodyTemplate: 'Updated SMS body {{amountKes}}',
      ctaLabel: null,
      ctaUrl: null,
      isActive: true,
    });
    const updated = await notificationTemplateService.getByCode('withdrawal_paid_sms');
    expect(updated.bodyTemplate).toBe('Updated SMS body {{amountKes}}');
    expect(updated.htmlBodyTemplate).toBeNull();
    expect(updated.subject).toBeNull();
  });

  it('rejects a blank body for any channel', async () => {
    await expect(
      notificationTemplateService.updateTemplate('withdrawal_paid_sms', {
        subject: null,
        heading: null,
        bodyTemplate: '   ',
        ctaLabel: null,
        ctaUrl: null,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(NotificationTemplateValidationError);
  });
});

describe('NotificationTemplateService.getDeliveryStats', () => {
  function baseMessage(overrides: Partial<Parameters<typeof outboundMessageRepository.create>[1]> = {}) {
    return {
      businessId: BUSINESS_ID,
      notificationId: null,
      channel: 'email' as const,
      templateCode: 'creator_registered_welcome_email',
      recipientRef: 'someone@example.com',
      renderedSubject: null,
      renderedBody: 'body',
      renderedHtmlBody: null,
      providerMessageId: null,
      status: 'sent' as const,
      failureReason: null,
      sentAt: null,
      deliveredAt: null,
      retryCount: 0,
      ...overrides,
    };
  }

  it('reports a null successRate and zero counts for a template that has never been dispatched', async () => {
    const stats = await notificationTemplateService.getDeliveryStats(BUSINESS_ID);

    const welcome = stats.find((s) => s.templateCode === 'creator_registered_welcome_email');
    expect(welcome).toEqual({ templateCode: 'creator_registered_welcome_email', sent: 0, failed: 0, pending: 0, successRate: null });
  });

  it('computes a real successRate from actual sent/failed counts, covering every template in the catalog', async () => {
    await outboundMessageRepository.create('m1', baseMessage({ status: 'sent' }));
    await outboundMessageRepository.create('m2', baseMessage({ status: 'sent' }));
    await outboundMessageRepository.create('m3', baseMessage({ status: 'failed' }));

    const stats = await notificationTemplateService.getDeliveryStats(BUSINESS_ID);

    expect(stats.map((s) => s.templateCode)).toEqual(['creator_registered_welcome_email', 'withdrawal_paid_sms']);
    const welcome = stats.find((s) => s.templateCode === 'creator_registered_welcome_email');
    expect(welcome).toEqual({ templateCode: 'creator_registered_welcome_email', sent: 2, failed: 1, pending: 0, successRate: 67 });
  });
});
