import { afterEach, describe, expect, it, vi } from 'vitest';
import { testJumiaConnection } from '@/lib/integrations/jumia/jumiaGateway';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';

const BUSINESS_ID = 'biz-jumia-gateway-test';
const SECRET = { apiKey: 'test-key', merchantId: 'merchant-1' };

describe('testJumiaConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves on a successful merchant profile lookup', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'jumia', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ merchant_id: 'merchant-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testJumiaConnection(BUSINESS_ID)).resolves.toBeUndefined();
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/merchants/merchant-1');
  });

  it('throws on a failed lookup', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'jumia', SECRET);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 })));

    await expect(testJumiaConnection(BUSINESS_ID)).rejects.toThrow(/Jumia connection test failed/);
  });
});
