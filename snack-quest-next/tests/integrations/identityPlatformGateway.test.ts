import { beforeEach, describe, expect, it, vi } from 'vitest';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';

/**
 * `applyAuthEmailConfig` talks to a real Google API (Identity Toolkit's
 * admin config endpoint) that has no emulator, so `getAdminAccessToken`/
 * `getAdminProjectId` and `fetch` itself are faked here — the behaviour
 * under test is the shape of the request this gateway builds, which is
 * exactly what broke in production: Identity Toolkit 400s on any field
 * `SendEmail` doesn't define, and it defines neither `senderEmail` nor
 * `senderDisplayName` directly (see the gateway's own doc comment).
 */

const BUSINESS_ID = 'biz-identity-platform-test';

vi.mock('@/lib/firebase/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/firebase/admin')>()),
  getAdminAccessToken: vi.fn().mockResolvedValue('fake-token'),
  getAdminProjectId: vi.fn().mockReturnValue('demo-project'),
}));

const fetchMock = vi.fn();

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
  await businessIntegrationSecretRepository.update(BUSINESS_ID, 'authEmail', {
    senderEmail: 'noreply@snackquests.shop',
    senderName: 'Snack Quest',
    host: 'smtp.protonmail.ch',
    port: '587',
    securityMode: 'SSL',
    username: 'support@snackquests.shop',
    password: 'secret',
  } as never);
});

describe('applyAuthEmailConfig', () => {
  it('never sends the fields Identity Toolkit rejects with a 400', async () => {
    const { applyAuthEmailConfig } = await import('@/lib/integrations/authEmail/identityPlatformGateway');
    await applyAuthEmailConfig(BUSINESS_ID);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.notification.sendEmail).not.toHaveProperty('senderEmail');
    expect(body.notification.sendEmail).not.toHaveProperty('senderDisplayName');
  });

  it('sends the address only inside smtp, and the display name only on the two templates this integration covers', async () => {
    const { applyAuthEmailConfig } = await import('@/lib/integrations/authEmail/identityPlatformGateway');
    await applyAuthEmailConfig(BUSINESS_ID);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const { sendEmail } = JSON.parse(init.body as string).notification;
    expect(sendEmail.smtp.senderEmail).toBe('noreply@snackquests.shop');
    expect(sendEmail.resetPasswordTemplate).toEqual({ senderDisplayName: 'Snack Quest' });
    expect(sendEmail.verifyEmailTemplate).toEqual({ senderDisplayName: 'Snack Quest' });
  });

  it('omits both templates when no sender name was given', async () => {
    await businessIntegrationSecretRepository.update(BUSINESS_ID, 'authEmail', { senderName: '' } as never);
    const { applyAuthEmailConfig } = await import('@/lib/integrations/authEmail/identityPlatformGateway');
    await applyAuthEmailConfig(BUSINESS_ID);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const { sendEmail } = JSON.parse(init.body as string).notification;
    expect(sendEmail).not.toHaveProperty('resetPasswordTemplate');
    expect(sendEmail).not.toHaveProperty('verifyEmailTemplate');
  });

  it('surfaces a 400 from Identity Toolkit as a readable error rather than swallowing it', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Invalid JSON payload received.' } }), { status: 400 }),
    );
    const { applyAuthEmailConfig } = await import('@/lib/integrations/authEmail/identityPlatformGateway');
    await expect(applyAuthEmailConfig(BUSINESS_ID)).rejects.toThrow(/Invalid JSON payload received/);
  });
});
