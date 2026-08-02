import { afterEach, describe, expect, it, vi } from 'vitest';
import { testMetaConnection } from '@/lib/integrations/meta/metaConversionGateway';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';

const BUSINESS_ID = 'biz-meta-gateway-test';
const SECRET = { pixelId: 'pixel-1', accessToken: 'token-1' };

describe('testMetaConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves on a successful Pixel lookup', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'pixel-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testMetaConnection(BUSINESS_ID)).resolves.toBeUndefined();
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('graph.facebook.com');
    expect(String(url)).toContain('pixel-1');
  });

  it('throws on an invalid access token', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', SECRET);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Invalid OAuth access token', { status: 401 })));

    await expect(testMetaConnection(BUSINESS_ID)).rejects.toThrow(/Meta connection test failed/);
  });
});
