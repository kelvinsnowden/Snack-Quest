import { beforeEach, describe, expect, it, vi } from 'vitest';

const { startWebCheckoutMock, getCurrentBusinessIdMock } = vi.hoisted(() => ({
  startWebCheckoutMock: vi.fn(),
  getCurrentBusinessIdMock: vi.fn(),
}));

vi.mock('@/services/conversationService', async () => {
  const actual = await vi.importActual<typeof import('@/services/conversationService')>('@/services/conversationService');
  return {
    ...actual,
    conversationService: { startWebCheckout: startWebCheckoutMock },
  };
});

vi.mock('@/lib/business/currentBusinessId', () => ({
  getCurrentBusinessId: getCurrentBusinessIdMock,
}));

import { POST as checkoutWebRoute } from '@/app/api/checkout/web/route';

const VALID_BODY = {
  packageId: 'pkg-1',
  quantity: 1,
  customerName: 'Jane Doe',
  phone: '0712345678',
  county: 'Nairobi',
  deliveryMethod: 'pickup' as const,
};

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/checkout/web', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentBusinessIdMock.mockReturnValue('biz-1');
  startWebCheckoutMock.mockResolvedValue({
    checkoutSessionId: 'session-1',
    pricing: { totalKes: 2500 },
    stkPushSent: true,
    payingPhone: '254712345678',
  });
});

/**
 * `POST /api/checkout/web` (§ close the loop: ad-conversion
 * attribution) — proves the route captures `ttclid`/`fbclid`/the
 * checkout page's own URL off the request at the one moment this app
 * still has real browser context, and always marks the resulting
 * conversation `channel: 'web'` regardless of whether an ad click id
 * is present at all.
 */
describe('POST /api/checkout/web attribution capture', () => {
  it('builds a web attribution snapshot from cookies and the Referer header', async () => {
    await checkoutWebRoute(
      request(VALID_BODY, {
        cookie: 'sq_visitor=v-1; sq_ttclid=tt-abc; sq_fbclid=fb-xyz',
        referer: 'https://snackquests.shop/checkout',
      }),
    );

    expect(startWebCheckoutMock).toHaveBeenCalledWith(
      'biz-1',
      expect.objectContaining({
        attribution: {
          channel: 'web',
          landingUrl: 'https://snackquests.shop/checkout',
          ttclid: 'tt-abc',
          fbclid: 'fb-xyz',
        },
      }),
    );
  });

  it('still marks the conversation web-originated with no click-id cookies present', async () => {
    await checkoutWebRoute(request(VALID_BODY));

    expect(startWebCheckoutMock).toHaveBeenCalledWith(
      'biz-1',
      expect.objectContaining({
        attribution: { channel: 'web', landingUrl: undefined, ttclid: undefined, fbclid: undefined },
      }),
    );
  });
});
