import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';

/**
 * Which account this app's own email goes out through (§ one email
 * provider for everything).
 *
 * The behaviour that matters is the choice, not the SMTP conversation:
 * a business that connected its own provider must send from its own
 * domain, and one that hasn't must keep sending exactly as it did
 * before this existed.
 */

const CONFIGURED = 'biz-smtp-configured';
const UNCONFIGURED = 'biz-smtp-unconfigured';

const sendMail = vi.fn();
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

const sendGridSend = vi.fn();
vi.mock('@/lib/integrations/email/sendGridGateway', () => ({
  sendGridGateway: { send: (...args: unknown[]) => sendGridSend(...args) },
}));

beforeEach(async () => {
  sendMail.mockReset().mockResolvedValue({ messageId: '<smtp-1@snackquests.shop>' });
  sendGridSend.mockReset().mockResolvedValue({ providerMessageId: 'sg-1' });
  await adminFirestore
    .collection('businesses')
    .doc(CONFIGURED)
    .collection('integrationSecrets')
    .doc('authEmail')
    .delete()
    .catch(() => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function configureSmtp(overrides: Record<string, string> = {}) {
  await businessIntegrationSecretRepository.update(CONFIGURED, 'authEmail', {
    senderEmail: 'noreply@snackquests.shop',
    senderName: 'Snack Quest',
    host: 'smtp.mailgun.org',
    port: '587',
    securityMode: 'START_TLS',
    username: 'postmaster@snackquests.shop',
    password: 'secret',
    ...overrides,
  } as never);
}

describe('smtpEmailGateway.send', () => {
  it("uses the business's own SMTP account, sending from its own domain", async () => {
    await configureSmtp();
    const { smtpEmailGateway } = await import('@/lib/integrations/email/smtpEmailGateway');

    const result = await smtpEmailGateway.send({
      businessId: CONFIGURED,
      to: 'creator@example.com',
      subject: 'Your commission',
      body: 'Nice work.',
    });

    expect(sendGridSend).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: 'Snack Quest', address: 'noreply@snackquests.shop' },
        to: 'creator@example.com',
        subject: 'Your commission',
      }),
    );
    expect(result.providerMessageId).toBe('<smtp-1@snackquests.shop>');
  });

  it('falls back to the platform account for a business that never configured SMTP', async () => {
    const { smtpEmailGateway } = await import('@/lib/integrations/email/smtpEmailGateway');

    const result = await smtpEmailGateway.send({
      businessId: UNCONFIGURED,
      to: 'creator@example.com',
      subject: 'Your commission',
      body: 'Nice work.',
    });

    expect(sendMail).not.toHaveBeenCalled();
    expect(sendGridSend).toHaveBeenCalledTimes(1);
    expect(result.providerMessageId).toBe('sg-1');
  });

  it('honours an explicit pause rather than quietly routing around it', async () => {
    await configureSmtp();
    await businessIntegrationSecretRepository.update(CONFIGURED, 'authEmail', {
      enabled: false,
    } as never);
    const { smtpEmailGateway } = await import('@/lib/integrations/email/smtpEmailGateway');

    await expect(
      smtpEmailGateway.send({
        businessId: CONFIGURED,
        to: 'creator@example.com',
        subject: 'Your commission',
        body: 'Nice work.',
      }),
    ).rejects.toThrow(/disabled/i);
    expect(sendGridSend).not.toHaveBeenCalled();
  });
});
