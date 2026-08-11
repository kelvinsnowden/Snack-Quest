import { afterEach, describe, expect, it, vi } from 'vitest';
import { testTiktokConnection, tiktokConversionGateway } from '@/lib/integrations/tiktok/tiktokConversionGateway';
import { businessIntegrationSecretRepository } from '@/repositories/businessIntegrationSecretRepository';

const BUSINESS_ID = 'biz-tiktok-gateway-test';
const SECRET = { pixelCode: 'pixel-1', accessToken: 'token-1', testEventCode: 'TEST123' };

describe('testTiktokConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves on a successful test-event dispatch, carrying the configured test_event_code', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'tiktok', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, message: 'OK' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testTiktokConnection(BUSINESS_ID)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('business-api.tiktok.com');
    expect((init.headers as Record<string, string>)['Access-Token']).toBe('token-1');
    const body = JSON.parse(init.body as string);
    expect(body.event_source_id).toBe('pixel-1');
    expect(body.test_event_code).toBe('TEST123');
    expect(body.data[0].user.phone_numbers[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('throws when TikTok reports a non-zero code even with a 200 status', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'tiktok', SECRET);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 40001, message: 'Invalid access token' }), { status: 200 })));

    await expect(testTiktokConnection(BUSINESS_ID)).rejects.toThrow(/TikTok connection test failed/);
  });

  it('throws a clear error and never calls fetch when no test event code is configured', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'tiktok', { pixelCode: 'pixel-1', accessToken: 'token-1' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(testTiktokConnection(BUSINESS_ID)).rejects.toThrow(/[Tt]est event code/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('tiktokConversionGateway.sendEvent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the hashed phone, the raw ttclid, and the page url', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'tiktok', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, message: 'OK' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await tiktokConversionGateway.sendEvent({
      businessId: BUSINESS_ID,
      eventName: 'Purchase',
      params: { currency: 'KES', value: 2500 },
      advancedMatching: { phone: '254712345678' },
      eventSourceUrl: 'https://snackquests.shop/checkout',
      clickId: 'tt-abc',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data[0].event).toBe('Purchase');
    expect(body.data[0].user.ttclid).toBe('tt-abc');
    expect(body.data[0].user.phone_numbers[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(body.data[0].properties).toEqual({ currency: 'KES', value: 2500 });
    expect(body.data[0].page.url).toBe('https://snackquests.shop/checkout');
  });

  it('omits ttclid entirely when no click id was captured, rather than sending an empty string', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'tiktok', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, message: 'OK' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await tiktokConversionGateway.sendEvent({
      businessId: BUSINESS_ID,
      eventName: 'Purchase',
      params: { currency: 'KES', value: 2500 },
      advancedMatching: { phone: '254712345678' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data[0].user.ttclid).toBeUndefined();
  });

  it('throws (for the caller to catch) when TikTok rejects the event', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'tiktok', SECRET);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 40001, message: 'Invalid' }), { status: 200 })));

    await expect(
      tiktokConversionGateway.sendEvent({
        businessId: BUSINESS_ID,
        eventName: 'Purchase',
        params: { currency: 'KES', value: 2500 },
      }),
    ).rejects.toThrow(/TikTok Events API dispatch failed/);
  });
});
