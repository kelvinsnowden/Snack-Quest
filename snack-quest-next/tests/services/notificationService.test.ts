import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { notificationTemplateRepository } from '@/repositories/notificationTemplateRepository';
import { outboundMessageRepository } from '@/repositories/outboundMessageRepository';
import { notificationRepository } from '@/repositories/notificationRepository';
import { NotificationService, TemplateNotFoundError, notificationService } from '@/services/notificationService';
import { MissingTemplateParamsError } from '@/lib/notifications/renderTemplate';
import type { WhatsAppGateway, EmailGateway, SmsGateway } from '@/lib/integrations/types';

/**
 * `NotificationService` end to end against the real Firestore emulator
 * for every Repository it touches, with fake Gateways injected via the
 * same constructor-injection pattern `ConversationService` uses — no
 * fetch stubbing needed, since the Gateway HTTP mechanics themselves
 * are already covered by tests/integrations/sendGridGateway.test.ts
 * and africasTalkingGateway.test.ts.
 */

const BUSINESS_ID = 'biz-notification-service-test';

function fakeWhatsapp(overrides: Partial<WhatsAppGateway> = {}): WhatsAppGateway {
  return {
    sendMessage: vi.fn().mockResolvedValue({ providerMessageId: 'wa-1' }),
    sendTemplate: vi.fn(),
    sendButtons: vi.fn(),
    sendList: vi.fn(),
    sendCatalogMessage: vi.fn(),
    markAsRead: vi.fn(),
    parseIncomingMessage: vi.fn(),
    verifyWebhookChallenge: vi.fn(),
    assignHumanAgent: vi.fn(),
    updateConversationStatus: vi.fn(),
    ...overrides,
  } as unknown as WhatsAppGateway;
}

function fakeEmail(overrides: Partial<EmailGateway> = {}): EmailGateway {
  return { send: vi.fn().mockResolvedValue({ providerMessageId: 'em-1' }), ...overrides };
}

function fakeSms(overrides: Partial<SmsGateway> = {}): SmsGateway {
  return { send: vi.fn().mockResolvedValue({ providerMessageId: 'sms-1' }), ...overrides };
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('notificationTemplates'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('outboundMessages'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('notifications'));

  await notificationTemplateRepository.upsert({
    templateCode: 'withdrawal_paid_sms',
    channel: 'sms',
    subject: null,
    bodyTemplate: 'Snack Quest: your withdrawal of KES {{amountKes}} has been paid.',
    heading: null,
    ctaLabel: null,
    ctaUrl: null,
    htmlBodyTemplate: null,
    requiredParams: ['amountKes'],
    version: 1,
    isActive: true,
  });
  await notificationTemplateRepository.upsert({
    templateCode: 'creator_registered_welcome_email',
    channel: 'email',
    subject: 'Welcome, {{displayName}}!',
    bodyTemplate: 'Hi {{displayName}}, your referral code is {{referralCode}}.',
    heading: null,
    ctaLabel: null,
    ctaUrl: null,
    htmlBodyTemplate: null,
    requiredParams: ['displayName', 'referralCode'],
    version: 1,
    isActive: true,
  });
});

describe('NotificationService.send', () => {
  it('throws TemplateNotFoundError when the templateCode has no active template for that channel', async () => {
    const service = new NotificationService(fakeWhatsapp(), fakeEmail(), fakeSms());

    await expect(
      service.send(BUSINESS_ID, {
        channel: 'sms',
        templateCode: 'does_not_exist',
        recipientType: 'creator',
        recipientId: 'creator-1',
        recipientRef: '254700000000',
        params: {},
        dedupeKey: 'w-1',
      }),
    ).rejects.toThrow(TemplateNotFoundError);
  });

  it('throws MissingTemplateParamsError when a required param is missing', async () => {
    const service = new NotificationService(fakeWhatsapp(), fakeEmail(), fakeSms());

    await expect(
      service.send(BUSINESS_ID, {
        channel: 'sms',
        templateCode: 'withdrawal_paid_sms',
        recipientType: 'creator',
        recipientId: 'creator-1',
        recipientRef: '254700000000',
        params: {},
        dedupeKey: 'w-1',
      }),
    ).rejects.toThrow(MissingTemplateParamsError);
  });

  it('renders the template, dispatches via the matching gateway, and marks the outbound message sent', async () => {
    const sms = fakeSms();
    const service = new NotificationService(fakeWhatsapp(), fakeEmail(), sms);

    await service.send(BUSINESS_ID, {
      channel: 'sms',
      templateCode: 'withdrawal_paid_sms',
      recipientType: 'creator',
      recipientId: 'creator-1',
      recipientRef: '254700000000',
      params: { amountKes: '500' },
      dedupeKey: 'withdrawal-1',
    });

    expect(sms.send).toHaveBeenCalledWith({
      to: '254700000000',
      body: 'Snack Quest: your withdrawal of KES 500 has been paid.',
    });

    const outbound = await outboundMessageRepository.findById('sms:withdrawal-1');
    expect(outbound?.status).toBe('sent');
    expect(outbound?.providerMessageId).toBe('sms-1');
    expect(outbound?.renderedBody).toBe('Snack Quest: your withdrawal of KES 500 has been paid.');
  });

  it('renders subject + body for an email template and dispatches via the email gateway', async () => {
    const email = fakeEmail();
    const service = new NotificationService(fakeWhatsapp(), email, fakeSms());

    await service.send(BUSINESS_ID, {
      channel: 'email',
      templateCode: 'creator_registered_welcome_email',
      recipientType: 'creator',
      recipientId: 'creator-1',
      recipientRef: 'creator@example.com',
      params: { displayName: 'Amina', referralCode: 'AMINA1234' },
      dedupeKey: 'creator-1',
    });

    expect(email.send).toHaveBeenCalledWith({
      // Carried through so the gateway can pick this business's own
      // SMTP account over the platform fallback.
      businessId: BUSINESS_ID,
      to: 'creator@example.com',
      subject: 'Welcome, Amina!',
      body: 'Hi Amina, your referral code is AMINA1234.',
    });
  });

  it('is idempotent by dedupeKey — a second send() for the same key never calls the gateway again', async () => {
    const sms = fakeSms();
    const service = new NotificationService(fakeWhatsapp(), fakeEmail(), sms);
    const input = {
      channel: 'sms' as const,
      templateCode: 'withdrawal_paid_sms',
      recipientType: 'creator' as const,
      recipientId: 'creator-1',
      recipientRef: '254700000000',
      params: { amountKes: '500' },
      dedupeKey: 'withdrawal-1',
    };

    await service.send(BUSINESS_ID, input);
    await service.send(BUSINESS_ID, input);

    expect(sms.send).toHaveBeenCalledTimes(1);
  });

  it('marks the outbound message failed (without throwing) when the gateway rejects', async () => {
    const sms = fakeSms({ send: vi.fn().mockRejectedValue(new Error('Africa\'s Talking send failed: timeout')) });
    const service = new NotificationService(fakeWhatsapp(), fakeEmail(), sms);

    await service.send(BUSINESS_ID, {
      channel: 'sms',
      templateCode: 'withdrawal_paid_sms',
      recipientType: 'creator',
      recipientId: 'creator-1',
      recipientRef: '254700000000',
      params: { amountKes: '500' },
      dedupeKey: 'withdrawal-2',
    });

    const outbound = await outboundMessageRepository.findById('sms:withdrawal-2');
    expect(outbound?.status).toBe('failed');
    expect(outbound?.failureReason).toContain('timeout');
  });

  it('createInApp writes a notifications entry alongside the channel dispatch', async () => {
    const sms = fakeSms();
    const service = new NotificationService(fakeWhatsapp(), fakeEmail(), sms);

    await service.send(BUSINESS_ID, {
      channel: 'sms',
      templateCode: 'withdrawal_paid_sms',
      recipientType: 'creator',
      recipientId: 'creator-1',
      recipientRef: '254700000000',
      params: { amountKes: '500' },
      dedupeKey: 'withdrawal-3',
      createInApp: true,
    });

    const entries = await notificationRepository.listForRecipient('creator-1');
    expect(entries).toHaveLength(1);
    expect(entries[0].data.templateCode).toBe('withdrawal_paid_sms');
    expect(sms.send).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationService.retrySweep', () => {
  it('re-dispatches only failed messages under the retry ceiling, resending the originally-rendered content', async () => {
    await outboundMessageRepository.create('sms:retry-1', {
      businessId: BUSINESS_ID,
      notificationId: null,
      channel: 'sms',
      templateCode: 'withdrawal_paid_sms',
      recipientRef: '254700000000',
      renderedSubject: null,
      renderedBody: 'Snack Quest: your withdrawal of KES 500 has been paid.',
      renderedHtmlBody: null,
      providerMessageId: null,
      status: 'failed',
      failureReason: 'prior timeout',
      sentAt: null,
      deliveredAt: null,
      retryCount: 1,
    });

    const sms = fakeSms();
    const service = new NotificationService(fakeWhatsapp(), fakeEmail(), sms);

    const result = await service.retrySweep(BUSINESS_ID);

    expect(result).toEqual({ attempted: 1 });
    expect(sms.send).toHaveBeenCalledWith({
      to: '254700000000',
      body: 'Snack Quest: your withdrawal of KES 500 has been paid.',
    });

    const outbound = await outboundMessageRepository.findById('sms:retry-1');
    expect(outbound?.status).toBe('sent');
    expect(outbound?.retryCount).toBe(2);
  });

  it('does not retry a message that is already at the retry ceiling', async () => {
    await outboundMessageRepository.create('sms:retry-2', {
      businessId: BUSINESS_ID,
      notificationId: null,
      channel: 'sms',
      templateCode: 'withdrawal_paid_sms',
      recipientRef: '254700000000',
      renderedSubject: null,
      renderedBody: 'body',
      renderedHtmlBody: null,
      providerMessageId: null,
      status: 'failed',
      failureReason: 'prior timeout',
      sentAt: null,
      deliveredAt: null,
      retryCount: 5,
    });

    const sms = fakeSms();
    const service = new NotificationService(fakeWhatsapp(), fakeEmail(), sms);

    const result = await service.retrySweep(BUSINESS_ID, 5);

    expect(result).toEqual({ attempted: 0 });
    expect(sms.send).not.toHaveBeenCalled();
  });
});

describe('NotificationService.listMessagesForRecipient', () => {
  it('returns messages matching any of the given recipientRefs, newest first, scoped to the business', async () => {
    await outboundMessageRepository.create('email:1', {
      businessId: BUSINESS_ID,
      notificationId: null,
      channel: 'email',
      templateCode: 'creator_registered_welcome_email',
      recipientRef: 'amina@example.com',
      renderedSubject: 'Welcome',
      renderedBody: 'body',
      renderedHtmlBody: null,
      providerMessageId: 'em-1',
      status: 'sent',
      failureReason: null,
      sentAt: null,
      deliveredAt: null,
      retryCount: 0,
    });
    await outboundMessageRepository.create('email:2-other-recipient', {
      businessId: BUSINESS_ID,
      notificationId: null,
      channel: 'email',
      templateCode: 'creator_registered_welcome_email',
      recipientRef: 'someone-else@example.com',
      renderedSubject: 'Welcome',
      renderedBody: 'body',
      renderedHtmlBody: null,
      providerMessageId: null,
      status: 'sent',
      failureReason: null,
      sentAt: null,
      deliveredAt: null,
      retryCount: 0,
    });

    const { messages } = await notificationService.listMessagesForRecipient(BUSINESS_ID, ['amina@example.com']);

    expect(messages.map((m) => m.id)).toEqual(['email:1']);
  });
});
