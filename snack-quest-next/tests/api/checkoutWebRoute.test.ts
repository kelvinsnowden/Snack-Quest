import { beforeEach, describe, expect, it, vi } from 'vitest';

const { startWebCheckoutMock, getCurrentBusinessIdMock, verifyCreatorSessionFromRequestMock } = vi.hoisted(() => ({
  startWebCheckoutMock: vi.fn(),
  getCurrentBusinessIdMock: vi.fn(),
  verifyCreatorSessionFromRequestMock: vi.fn(),
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

vi.mock('@/lib/auth/creatorSession', () => ({
  verifyCreatorSessionFromRequest: verifyCreatorSessionFromRequestMock,
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
  verifyCreatorSessionFromRequestMock.mockResolvedValue(null);
  startWebCheckoutMock.mockResolvedValue({
    checkoutSessionId: 'session-1',
    pricing: { totalKes: 2500 },
    stkPushSent: true,
    payingPhone: '254712345678',
  });
});

/**
 * `POST /api/checkout/web` (§ Creator-Only Offers) — the creator
 * discount is derived from `verifyCreatorSessionFromRequest`, which
 * itself re-verifies the httpOnly session cookie against Firestore
 * (see `lib/auth/creatorSession.ts`), never from anything the request
 * body claims. These tests only prove the route wires that result
 * through correctly; the cookie verification itself is covered by
 * `creatorAuthService`'s own tests.
 */
describe('POST /api/checkout/web creator discount', () => {
  it('marks the checkout as a creator checkout when a valid creator session is present', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue({ uid: 'creator-1' });

    await checkoutWebRoute(request(VALID_BODY, { cookie: 'sq_creator_session=valid-cookie' }));

    expect(startWebCheckoutMock).toHaveBeenCalledWith(
      'biz-1',
      expect.objectContaining({ isCreatorCheckout: true }),
    );
  });

  it('never marks the checkout as a creator checkout without a verified session — a missing or forged cookie cannot grant the discount', async () => {
    verifyCreatorSessionFromRequestMock.mockResolvedValue(null);

    await checkoutWebRoute(request(VALID_BODY, { cookie: 'sq_creator_session=forged-or-expired' }));

    expect(startWebCheckoutMock).toHaveBeenCalledWith(
      'biz-1',
      expect.objectContaining({ isCreatorCheckout: false }),
    );
  });

  it('never marks a customer with no cookies at all as a creator checkout', async () => {
    await checkoutWebRoute(request(VALID_BODY));

    expect(startWebCheckoutMock).toHaveBeenCalledWith(
      'biz-1',
      expect.objectContaining({ isCreatorCheckout: false }),
    );
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
          // The same id the funnel events carry, so this order can be
          // lined up against what the visitor actually did.
          visitorId: 'v-1',
        },
      }),
    );
  });

  /**
   * Regression: this used to assert
   * `{ channel: 'web', landingUrl: undefined, ttclid: undefined, fbclid: undefined }`
   * and passed, because `startWebCheckout` is mocked here and the value
   * never reached Firestore. In production it did, and Firestore
   * rejects a document containing an undefined value — so the public
   * checkout returned a 500 for every visitor who arrived without a
   * TikTok or Facebook click cookie, which is nearly all of them.
   *
   * The test now asserts the shape Firestore can actually store:
   * absent keys, not keys set to undefined.
   */
  it('omits click-id keys entirely when the cookies are absent', async () => {
    await checkoutWebRoute(request(VALID_BODY));

    expect(startWebCheckoutMock).toHaveBeenCalledWith(
      'biz-1',
      expect.objectContaining({ attribution: { channel: 'web' } }),
    );

    // The invariant, stated directly: nothing bound for Firestore may
    // carry an undefined value.
    const { attribution } = startWebCheckoutMock.mock.calls[0][1];
    expect(Object.values(attribution).some((value) => value === undefined)).toBe(false);
    expect('ttclid' in attribution).toBe(false);
    expect('fbclid' in attribution).toBe(false);
    expect('landingUrl' in attribution).toBe(false);
  });

  it('keeps only the click ids that are actually present', async () => {
    await checkoutWebRoute(request(VALID_BODY, { cookie: 'sq_ttclid=tt-abc' }));

    const { attribution } = startWebCheckoutMock.mock.calls[0][1];
    expect(attribution).toEqual({ channel: 'web', ttclid: 'tt-abc' });
    expect(Object.values(attribution).some((value) => value === undefined)).toBe(false);
  });
});
