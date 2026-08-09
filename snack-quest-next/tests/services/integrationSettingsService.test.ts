import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { INTEGRATION_FIELD_MANIFEST } from '@/lib/integrations/fieldManifest';
import {
  integrationSettingsService,
  IntegrationValidationError,
  UnknownIntegrationProviderError,
} from '@/services/integrationSettingsService';

const BUSINESS_ID = 'biz-integration-settings-test';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(
    adminFirestore.collection('businesses').doc(BUSINESS_ID).collection('integrationSecrets'),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('IntegrationSettingsService.listSummaries', () => {
  it('reports every provider as missing when nothing is configured', async () => {
    const summaries = await integrationSettingsService.listSummaries(BUSINESS_ID);
    expect(summaries.every((s) => s.status === 'missing')).toBe(true);
    // Derived from the manifest rather than a hardcoded list, so
    // adding a provider is caught here as a genuine regression only if
    // the portal actually stops listing one — not simply because the
    // count changed.
    expect(summaries.map((s) => s.provider).sort()).toEqual(
      Object.keys(INTEGRATION_FIELD_MANIFEST).sort(),
    );
  });

  it('reports connected once required fields are present, with secret values masked', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'jumia', {
      apiKey: 'super-secret-key-1234',
      merchantId: 'merchant-1',
    });

    const summary = await integrationSettingsService.getSummary(BUSINESS_ID, 'jumia');
    expect(summary.status).toBe('connected');
    const apiKeyField = summary.fields.find((f) => f.key === 'apiKey');
    expect(apiKeyField?.value).toBe('••••1234');
    expect(apiKeyField?.value).not.toContain('super-secret');
    const merchantField = summary.fields.find((f) => f.key === 'merchantId');
    expect(merchantField?.value).toBe('merchant-1');
  });

  it('reports missing when a required field is absent', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', {
      pixelId: '',
      accessToken: 'token-1',
    } as never);

    const summary = await integrationSettingsService.getSummary(BUSINESS_ID, 'meta');
    expect(summary.status).toBe('missing');
  });

  it('reports disabled regardless of field completeness', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'whatchimp', {
      apiKey: 'key-1',
      phoneNumberId: 'phone-1',
      enabled: false,
    });

    const summary = await integrationSettingsService.getSummary(BUSINESS_ID, 'whatchimp');
    expect(summary.status).toBe('disabled');
    expect(summary.enabled).toBe(false);
  });

  it('throws for an unknown provider', async () => {
    await expect(integrationSettingsService.getSummary(BUSINESS_ID, 'not-a-provider')).rejects.toBeInstanceOf(
      UnknownIntegrationProviderError,
    );
  });

  it('reports secretsEncryptedAtRest as null when unconfigured, false when plaintext, true once encrypted', async () => {
    const unconfigured = await integrationSettingsService.getSummary(BUSINESS_ID, 'jumia');
    expect(unconfigured.secretsEncryptedAtRest).toBeNull();

    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'jumia', {
      apiKey: 'plain-key',
      merchantId: 'merchant-1',
    });
    const plaintext = await integrationSettingsService.getSummary(BUSINESS_ID, 'jumia');
    expect(plaintext.secretsEncryptedAtRest).toBe(false);

    process.env.SECRET_ENCRYPTION_KEY = 'c'.repeat(64);
    try {
      await businessIntegrationSecretRepository.update(BUSINESS_ID, 'jumia', { apiKey: 'plain-key' });
      const encrypted = await integrationSettingsService.getSummary(BUSINESS_ID, 'jumia');
      expect(encrypted.secretsEncryptedAtRest).toBe(true);
    } finally {
      delete process.env.SECRET_ENCRYPTION_KEY;
    }
  });
});

describe('IntegrationSettingsService.encryptionConfigured', () => {
  afterEach(() => {
    delete process.env.SECRET_ENCRYPTION_KEY;
  });

  it('reflects whether SECRET_ENCRYPTION_KEY is set in this environment', () => {
    delete process.env.SECRET_ENCRYPTION_KEY;
    expect(integrationSettingsService.encryptionConfigured()).toBe(false);

    process.env.SECRET_ENCRYPTION_KEY = 'd'.repeat(64);
    expect(integrationSettingsService.encryptionConfigured()).toBe(true);
  });
});

describe('IntegrationSettingsService.updateSecret', () => {
  it('creates a new secret and returns masked before/after', async () => {
    const { before, after } = await integrationSettingsService.updateSecret(
      BUSINESS_ID,
      'jumia',
      { apiKey: 'new-key-5678', merchantId: 'merchant-9' },
      'staff-1',
    );

    expect(before.status).toBe('missing');
    expect(after.status).toBe('connected');
    expect(after.fields.find((f) => f.key === 'apiKey')?.value).toBe('••••5678');
  });

  it('merges a partial patch, leaving untouched fields intact', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', {
      consumerKey: 'ck-1',
      consumerSecret: 'cs-1',
      shortcode: '111111',
      passkey: 'pk-1',
      callbackUrl: 'https://example.com/cb',
      env: 'sandbox',
    });

    await integrationSettingsService.updateSecret(BUSINESS_ID, 'daraja', { shortcode: '222222' }, 'staff-1');

    const raw = await businessIntegrationSecretRepository.get(BUSINESS_ID, 'daraja');
    expect(raw.shortcode).toBe('222222');
    expect(raw.consumerKey).toBe('ck-1');
  });

  it('rejects a patch that would leave a required field empty', async () => {
    await expect(
      integrationSettingsService.updateSecret(BUSINESS_ID, 'jumia', { apiKey: 'only-this' }, 'staff-1'),
    ).rejects.toBeInstanceOf(IntegrationValidationError);
  });

  it('can enable/disable an integration via the enabled flag', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', { pixelId: 'p-1', accessToken: 't-1' });

    const { after } = await integrationSettingsService.updateSecret(BUSINESS_ID, 'meta', { enabled: false }, 'staff-1');
    expect(after.status).toBe('disabled');
  });
});

describe('IntegrationSettingsService.testConnection', () => {
  it('returns success and persists the result for a real, working call', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', {
      pixelId: 'pixel-1',
      accessToken: 'token-1',
      testEventCode: 'TEST1',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ events_received: 1 }), { status: 200 })));

    const result = await integrationSettingsService.testConnection(BUSINESS_ID, 'meta');
    expect(result).toEqual({ success: true, error: null });

    const summary = await integrationSettingsService.getSummary(BUSINESS_ID, 'meta');
    expect(summary.lastTestStatus).toBe('success');
    expect(summary.status).toBe('connected');
  });

  it('returns failure and persists it for a rejected call', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', {
      pixelId: 'pixel-1',
      accessToken: 'bad-token',
      testEventCode: 'TEST1',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Invalid OAuth access token', { status: 401 })));

    const result = await integrationSettingsService.testConnection(BUSINESS_ID, 'meta');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/401/);

    const summary = await integrationSettingsService.getSummary(BUSINESS_ID, 'meta');
    expect(summary.status).toBe('invalid');
  });

  it('reports a clear error instead of testing when nothing is configured', async () => {
    const result = await integrationSettingsService.testConnection(BUSINESS_ID, 'jumia');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no credentials configured/i);
  });

  it('refuses to test a disabled integration', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'jumia', {
      apiKey: 'key-1',
      merchantId: 'merchant-1',
      enabled: false,
    });

    const result = await integrationSettingsService.testConnection(BUSINESS_ID, 'jumia');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/disabled/i);
  });
});
