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
const verify = vi.fn();
const createTransport = vi.fn((..._args: unknown[]) => ({ sendMail, verify }));
vi.mock('nodemailer', () => ({
  default: { createTransport: (...args: unknown[]) => createTransport(...args) },
}));

const sendGridSend = vi.fn();
vi.mock('@/lib/integrations/email/sendGridGateway', () => ({
  sendGridGateway: { send: (...args: unknown[]) => sendGridSend(...args) },
}));

beforeEach(async () => {
  sendMail.mockReset().mockResolvedValue({ messageId: '<smtp-1@snackquests.shop>' });
  verify.mockReset().mockResolvedValue(true);
  createTransport.mockClear();
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

describe('buildTransport TLS resolution', () => {
  /**
   * §"Sort out the email" — a business that saved `securityMode: SSL`
   * with `port: 587` (or `START_TLS` with `port: 465`) previously made
   * nodemailer attempt the wrong TLS handshake against the port, which
   * OpenSSL reports as "wrong version number". 465 and 587 are
   * well-known enough that the port now wins over a disagreeing
   * `securityMode`, so this exact misconfiguration self-heals instead
   * of failing.
   */
  it('uses implicit TLS on port 465 even if securityMode was saved as START_TLS', async () => {
    await configureSmtp({ port: '465', securityMode: 'START_TLS' });
    const { smtpEmailGateway } = await import('@/lib/integrations/email/smtpEmailGateway');

    await smtpEmailGateway.send({
      businessId: CONFIGURED,
      to: 'creator@example.com',
      subject: 'Your commission',
      body: 'Nice work.',
    });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true, requireTLS: false }),
    );
  });

  it('uses STARTTLS on port 587 even if securityMode was saved as SSL', async () => {
    await configureSmtp({ port: '587', securityMode: 'SSL' });
    const { smtpEmailGateway } = await import('@/lib/integrations/email/smtpEmailGateway');

    await smtpEmailGateway.send({
      businessId: CONFIGURED,
      to: 'creator@example.com',
      subject: 'Your commission',
      body: 'Nice work.',
    });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false, requireTLS: true }),
    );
  });

  it('falls back to the saved securityMode on a non-standard port', async () => {
    await configureSmtp({ port: '2525', securityMode: 'SSL' });
    const { smtpEmailGateway } = await import('@/lib/integrations/email/smtpEmailGateway');

    await smtpEmailGateway.send({
      businessId: CONFIGURED,
      to: 'creator@example.com',
      subject: 'Your commission',
      body: 'Nice work.',
    });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 2525, secure: true, requireTLS: false }),
    );
  });
});

describe('testAuthEmailConnection', () => {
  it('dials the real SMTP server and authenticates, without sending anything', async () => {
    await configureSmtp();
    const { testAuthEmailConnection } = await import('@/lib/integrations/email/smtpEmailGateway');

    await testAuthEmailConnection(CONFIGURED);

    expect(verify).toHaveBeenCalledTimes(1);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('surfaces a real auth/connection failure rather than swallowing it', async () => {
    await configureSmtp();
    verify.mockRejectedValue(new Error('Invalid login: 535 authentication failed'));
    const { testAuthEmailConnection } = await import('@/lib/integrations/email/smtpEmailGateway');

    await expect(testAuthEmailConnection(CONFIGURED)).rejects.toThrow(/authentication failed/);
  });

  it('refuses to test a business with nothing configured', async () => {
    const { testAuthEmailConnection } = await import('@/lib/integrations/email/smtpEmailGateway');
    await expect(testAuthEmailConnection(UNCONFIGURED)).rejects.toThrow();
  });
});
