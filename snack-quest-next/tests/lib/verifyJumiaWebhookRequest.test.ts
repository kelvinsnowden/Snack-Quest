import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';
import { verifyJumiaWebhookRequest } from '@/lib/webhooks/verifyJumiaWebhookRequest';

const BUSINESS_ID = 'biz-verify-jumia-webhook-test';

const BASE_SECRET = {
  apiKey: 'test-key',
  merchantId: 'merchant-1',
};

function requestWithKey(key?: string): Request {
  const url = new URL(`https://example.com/api/webhooks/jumia/${BUSINESS_ID}`);
  if (key !== undefined) {
    url.searchParams.set('key', key);
  }
  return new Request(url, { method: 'POST' });
}

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('businesses'));
});

describe('verifyJumiaWebhookRequest', () => {
  it('passes (fail-open) when the business has no Jumia config at all', async () => {
    const result = await verifyJumiaWebhookRequest(BUSINESS_ID, requestWithKey());
    expect(result.ok).toBe(true);
  });

  it('passes (fail-open) when Jumia is configured but no webhookSecret is set', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'jumia', BASE_SECRET);

    const result = await verifyJumiaWebhookRequest(BUSINESS_ID, requestWithKey());
    expect(result.ok).toBe(true);
  });

  it('rejects a missing key once a webhookSecret is configured', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'jumia', { ...BASE_SECRET, webhookSecret: 'real-secret' });

    const result = await verifyJumiaWebhookRequest(BUSINESS_ID, requestWithKey());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it('rejects a wrong key once a webhookSecret is configured', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'jumia', { ...BASE_SECRET, webhookSecret: 'real-secret' });

    const result = await verifyJumiaWebhookRequest(BUSINESS_ID, requestWithKey('wrong-secret'));
    expect(result.ok).toBe(false);
  });

  it('passes a matching key once a webhookSecret is configured', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'jumia', { ...BASE_SECRET, webhookSecret: 'real-secret' });

    const result = await verifyJumiaWebhookRequest(BUSINESS_ID, requestWithKey('real-secret'));
    expect(result.ok).toBe(true);
  });
});
