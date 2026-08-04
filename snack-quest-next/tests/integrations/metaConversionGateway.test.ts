import { afterEach, describe, expect, it, vi } from 'vitest';
import { testMetaConnection } from '@/lib/integrations/meta/metaConversionGateway';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';

const BUSINESS_ID = 'biz-meta-gateway-test';
const SECRET = { pixelId: 'pixel-1', accessToken: 'token-1', testEventCode: 'TEST123' };

describe('testMetaConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves on a successful test-event dispatch, carrying the configured test_event_code', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testMetaConnection(BUSINESS_ID)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('graph.facebook.com');
    expect(String(url)).toContain('pixel-1/events');
    const body = JSON.parse(init.body as string);
    expect(body.test_event_code).toBe('TEST123');
    expect(body.data[0].action_source).toBe('chat');
  });

  it('throws on an invalid access token', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', SECRET);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Invalid OAuth access token', { status: 401 })));

    await expect(testMetaConnection(BUSINESS_ID)).rejects.toThrow(/Meta connection test failed/);
  });

  it('throws a clear error and never calls fetch when no test event code is configured', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', { pixelId: 'pixel-1', accessToken: 'token-1' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(testMetaConnection(BUSINESS_ID)).rejects.toThrow(/[Tt]est event code/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
