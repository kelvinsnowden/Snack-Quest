import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { verifyDarajaWebhookRequest } from '@/lib/webhooks/verifyDarajaWebhookRequest';

const BUSINESS_ID = 'biz-verify-daraja-webhook-test';

const BASE_SECRET = {
  consumerKey: 'test-key',
  consumerSecret: 'test-secret',
  shortcode: '174379',
  accountType: 'till' as const,
  passkey: 'test-passkey',
  callbackUrl: `https://example.com/api/webhooks/daraja/${BUSINESS_ID}`,
  env: 'sandbox' as const,
};

function requestWithKey(key?: string): Request {
  const url = new URL(`https://example.com/api/webhooks/daraja/${BUSINESS_ID}`);
  if (key !== undefined) {
    url.searchParams.set('key', key);
  }
  return new Request(url, { method: 'POST' });
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('businesses'));
});

describe('verifyDarajaWebhookRequest', () => {
  it('passes (fail-open) when the business has no Daraja config at all', async () => {
    const result = await verifyDarajaWebhookRequest(BUSINESS_ID, requestWithKey());
    expect(result.ok).toBe(true);
  });

  it('passes (fail-open) when Daraja is configured but no webhookSecret is set', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', BASE_SECRET);

    const result = await verifyDarajaWebhookRequest(BUSINESS_ID, requestWithKey());
    expect(result.ok).toBe(true);
  });

  it('rejects a missing key once a webhookSecret is configured', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', { ...BASE_SECRET, webhookSecret: 'real-secret' });

    const result = await verifyDarajaWebhookRequest(BUSINESS_ID, requestWithKey());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it('rejects a wrong key once a webhookSecret is configured', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', { ...BASE_SECRET, webhookSecret: 'real-secret' });

    const result = await verifyDarajaWebhookRequest(BUSINESS_ID, requestWithKey('wrong-secret'));
    expect(result.ok).toBe(false);
  });

  it('passes a matching key once a webhookSecret is configured', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'daraja', { ...BASE_SECRET, webhookSecret: 'real-secret' });

    const result = await verifyDarajaWebhookRequest(BUSINESS_ID, requestWithKey('real-secret'));
    expect(result.ok).toBe(true);
  });
});
