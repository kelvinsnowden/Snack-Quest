import { beforeEach, describe, expect, it, vi } from 'vitest';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';

/**
 * `applyAuthEmailConfig` talks to a real Google API (Identity Toolkit's
 * admin config endpoint) that has no emulator, so `getAdminAccessToken`/
 * `getAdminProjectId` and `fetch` itself are faked here — the behaviour
 * under test is the shape of the request this gateway builds, which is
 * exactly what broke in production twice: first a 400 on `senderEmail`
 * outside `smtp` (`SendEmail` has no such field), then
 * `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` once that was fixed and this tried
 * setting a sender display name via `resetPasswordTemplate`/
 * `verifyEmailTemplate` instead — a real save against a live project
 * confirmed Identity Toolkit refuses that too (see the gateway's own
 * doc comment).
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
  it('never sends the fields Identity Toolkit rejects — either the 400 or the EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED shape', async () => {
    const { applyAuthEmailConfig } = await import('@/lib/integrations/authEmail/identityPlatformGateway');
    await applyAuthEmailConfig(BUSINESS_ID);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const { sendEmail } = JSON.parse(init.body as string).notification;
    expect(sendEmail).not.toHaveProperty('senderEmail');
    expect(sendEmail).not.toHaveProperty('senderDisplayName');
    expect(sendEmail).not.toHaveProperty('resetPasswordTemplate');
    expect(sendEmail).not.toHaveProperty('verifyEmailTemplate');
  });

  it('sends the address only inside smtp', async () => {
    const { applyAuthEmailConfig } = await import('@/lib/integrations/authEmail/identityPlatformGateway');
    await applyAuthEmailConfig(BUSINESS_ID);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const { sendEmail } = JSON.parse(init.body as string).notification;
    expect(sendEmail.smtp.senderEmail).toBe('noreply@snackquests.shop');
    expect(sendEmail.method).toBe('CUSTOM_SMTP');
  });

  it('surfaces a 400 from Identity Toolkit as a readable error rather than swallowing it', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Invalid JSON payload received.' } }), { status: 400 }),
    );
    const { applyAuthEmailConfig } = await import('@/lib/integrations/authEmail/identityPlatformGateway');
    await expect(applyAuthEmailConfig(BUSINESS_ID)).rejects.toThrow(/Invalid JSON payload received/);
  });
});
