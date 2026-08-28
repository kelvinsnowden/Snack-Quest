import { afterEach, describe, expect, it, vi } from 'vitest';
import { metaConversionGateway, testMetaConnection } from '@/lib/integrations/meta/metaConversionGateway';
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
    // Must carry at least one matching parameter — Meta rejects an
    // empty `user_data` with error_subcode 2804050, confirmed against
    // a real Pixel during setup.
    expect(body.data[0].user_data.ph).toHaveLength(1);
    expect(body.data[0].user_data.ph[0]).toMatch(/^[0-9a-f]{64}$/);
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

describe('metaConversionGateway.sendEvent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /*
   * The click that brought the customer, in the form Meta matches on.
   * Without it a purchase from a Meta ad reaches Meta as a hashed phone
   * number and nothing else, to be matched against profile data or not
   * matched at all — which is exactly what production was doing.
   */
  it('sends fbc and fbp unhashed while still hashing the phone', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const fbc = 'fb.1.1724760000000.abc123';
    const fbp = 'fb.1.1724760000000.987654321';
    await metaConversionGateway.sendEvent({
      businessId: BUSINESS_ID,
      eventName: 'Purchase',
      params: { currency: 'KES', value: 3500 },
      advancedMatching: { phone: '+254700000000', fbc, fbp },
      actionSource: 'website',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const userData = JSON.parse(init.body as string).data[0].user_data;

    /*
     * The asymmetry is Meta's and it fails silently: a hashed click id
     * is accepted, matches nothing, and is indistinguishable from a
     * conversion that simply had no click behind it. So this asserts
     * the exact values survive rather than merely being present.
     */
    expect(userData.fbc).toBe(fbc);
    expect(userData.fbp).toBe(fbp);
    expect(userData.ph[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(userData.ph[0]).not.toBe('+254700000000');
  });

  /** A visitor who arrived with no ad click still converts; the payload just carries what it has. */
  it('omits fbc and fbp entirely rather than sending empty values', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await metaConversionGateway.sendEvent({
      businessId: BUSINESS_ID,
      eventName: 'Purchase',
      params: { currency: 'KES', value: 3500 },
      advancedMatching: { phone: '+254700000000' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const userData = JSON.parse(init.body as string).data[0].user_data;
    expect('fbc' in userData).toBe(false);
    expect('fbp' in userData).toBe(false);
    expect(userData.ph).toHaveLength(1);
  });

  it('defaults to action_source "chat" with no event_source_url when the caller says nothing', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await metaConversionGateway.sendEvent({
      businessId: BUSINESS_ID,
      eventName: 'Purchase',
      params: { currency: 'KES', value: 2500 },
      advancedMatching: { phone: '254712345678' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data[0].action_source).toBe('chat');
    expect(body.data[0].event_source_url).toBeUndefined();
  });

  it('reports action_source "website" with the checkout URL for a web-originated order', async () => {
    await businessIntegrationSecretRepository.set(BUSINESS_ID, 'meta', SECRET);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await metaConversionGateway.sendEvent({
      businessId: BUSINESS_ID,
      eventName: 'Purchase',
      params: { currency: 'KES', value: 2500 },
      advancedMatching: { phone: '254712345678' },
      actionSource: 'website',
      eventSourceUrl: 'https://snackquests.shop/checkout',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data[0].action_source).toBe('website');
    expect(body.data[0].event_source_url).toBe('https://snackquests.shop/checkout');
  });
});
