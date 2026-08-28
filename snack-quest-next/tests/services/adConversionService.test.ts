import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';

const { metaSendEventMock, tiktokSendEventMock } = vi.hoisted(() => ({
  metaSendEventMock: vi.fn(),
  tiktokSendEventMock: vi.fn(),
}));

vi.mock('@/lib/integrations/meta/metaConversionGateway', () => ({
  metaConversionGateway: { sendEvent: metaSendEventMock },
}));

vi.mock('@/lib/integrations/tiktok/tiktokConversionGateway', () => ({
  tiktokConversionGateway: { sendEvent: tiktokSendEventMock },
}));

import { adConversionService } from '@/services/adConversionService';

const BUSINESS_ID = 'biz-ad-conversion-test';

async function domainEventsFor(orderId: string) {
  const snapshot = await adminFirestore
    .collection('domainEvents')
    .where('aggregateId', '==', orderId)
    .get();
  return snapshot.docs.map((doc) => doc.data());
}

beforeEach(async () => {
  vi.clearAllMocks();
  metaSendEventMock.mockResolvedValue(undefined);
  tiktokSendEventMock.mockResolvedValue(undefined);
  await adminFirestore.recursiveDelete(adminFirestore.collection('domainEvents'));
});

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * `AdConversionService.dispatchPurchase` (§ close the loop:
 * ad-conversion attribution) — proves the two properties the whole
 * feature depends on: Meta always fires but with `action_source`
 * driven by whether the order actually started on the website, and
 * TikTok only ever fires for a web-originated order, since a TikTok ad
 * can't have driven a native WhatsApp message.
 */
describe('AdConversionService.dispatchPurchase', () => {
  it('reports action_source "chat" and never calls TikTok for a native WhatsApp order', async () => {
    await adConversionService.dispatchPurchase({
      businessId: BUSINESS_ID,
      orderId: 'order-chat-1',
      phoneNumber: '254712345678',
      amountKes: 2500,
      attribution: null,
    });

    expect(metaSendEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ actionSource: 'chat', eventSourceUrl: undefined }),
    );
    expect(tiktokSendEventMock).not.toHaveBeenCalled();

    const events = await domainEventsFor('order-chat-1');
    expect(events).toEqual([
      expect.objectContaining({ type: 'ConversionDispatched', payload: { eventName: 'Purchase', provider: 'meta' } }),
    ]);
  });

  it('reports action_source "website" and dispatches TikTok with the ttclid for a web-originated order', async () => {
    await adConversionService.dispatchPurchase({
      businessId: BUSINESS_ID,
      orderId: 'order-web-1',
      phoneNumber: '254712345678',
      amountKes: 2500,
      attribution: { channel: 'web', landingUrl: 'https://snackquests.shop/checkout', ttclid: 'tt-abc' },
    });

    expect(metaSendEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ actionSource: 'website', eventSourceUrl: 'https://snackquests.shop/checkout' }),
    );
    expect(tiktokSendEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'Purchase',
        eventSourceUrl: 'https://snackquests.shop/checkout',
        clickId: 'tt-abc',
      }),
    );

    const events = await domainEventsFor('order-web-1');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'ConversionDispatched', payload: { eventName: 'Purchase', provider: 'meta' } }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'ConversionDispatched', payload: { eventName: 'Purchase', provider: 'tiktok' } }),
    );
  });

  it('dispatches TikTok for a web-originated order even with no ttclid captured', async () => {
    await adConversionService.dispatchPurchase({
      businessId: BUSINESS_ID,
      orderId: 'order-web-2',
      phoneNumber: '254712345678',
      amountKes: 2500,
      attribution: { channel: 'web' },
    });

    expect(tiktokSendEventMock).toHaveBeenCalledWith(expect.objectContaining({ clickId: undefined }));
  });

  it('a Meta failure never suppresses the TikTok dispatch', async () => {
    metaSendEventMock.mockRejectedValue(new Error('Meta CAPI dispatch failed: 401'));

    await adConversionService.dispatchPurchase({
      businessId: BUSINESS_ID,
      orderId: 'order-meta-fail',
      phoneNumber: '254712345678',
      amountKes: 2500,
      attribution: { channel: 'web', ttclid: 'tt-abc' },
    });

    expect(tiktokSendEventMock).toHaveBeenCalled();
    const events = await domainEventsFor('order-meta-fail');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'ConversionDispatchFailed', payload: expect.objectContaining({ provider: 'meta' }) }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'ConversionDispatched', payload: { eventName: 'Purchase', provider: 'tiktok' } }),
    );
  });

  it('a TikTok failure never affects the already-dispatched Meta event', async () => {
    tiktokSendEventMock.mockRejectedValue(new Error('TikTok Events API dispatch failed: 401'));

    await adConversionService.dispatchPurchase({
      businessId: BUSINESS_ID,
      orderId: 'order-tiktok-fail',
      phoneNumber: '254712345678',
      amountKes: 2500,
      attribution: { channel: 'web', ttclid: 'tt-abc' },
    });

    const events = await domainEventsFor('order-tiktok-fail');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'ConversionDispatched', payload: { eventName: 'Purchase', provider: 'meta' } }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'ConversionDispatchFailed', payload: expect.objectContaining({ provider: 'tiktok' }) }),
    );
  });
});

/**
 * The click id reaching Meta (§ close the loop: ad-conversion
 * attribution).
 *
 * Production had captured `fbclid` for weeks and forwarded it nowhere:
 * one real Meta-sourced order was reported with a hashed phone number
 * and nothing else, leaving Meta to guess whether its own ad earned it.
 */
describe('AdConversionService.dispatchPurchase — Meta click id', () => {
  beforeEach(() => {
    metaSendEventMock.mockReset();
    tiktokSendEventMock.mockReset();
    metaSendEventMock.mockResolvedValue(undefined);
    tiktokSendEventMock.mockResolvedValue(undefined);
  });

  /*
   * The stored value carries the moment of the click. Rebuilding it at
   * dispatch would stamp it with the moment of the purchase, and a
   * customer who clicked on Monday and paid on Thursday would be
   * reported three days outside their own attribution window.
   */
  it('forwards the stored fbc unchanged, keeping the real click time', async () => {
    const clickedThreeDaysAgo = 'fb.1.1724760000000.abc123';

    await adConversionService.dispatchPurchase({
      businessId: 'biz-1',
      orderId: 'order-1',
      phoneNumber: '+254700000000',
      amountKes: 3500,
      attribution: { channel: 'web', fbclid: 'abc123', fbc: clickedThreeDaysAgo, fbp: 'fb.1.1724000000000.99' },
    });

    const [call] = metaSendEventMock.mock.calls;
    expect(call[0].advancedMatching.fbc).toBe(clickedThreeDaysAgo);
    expect(call[0].advancedMatching.fbp).toBe('fb.1.1724000000000.99');
    expect(call[0].advancedMatching.phone).toBe('+254700000000');
  });

  /** Snapshots written before the click time was stored hold a bare id; an approximate time still beats sending none. */
  it('derives an fbc for a legacy snapshot that only has the raw click id', async () => {
    await adConversionService.dispatchPurchase({
      businessId: 'biz-1',
      orderId: 'order-1',
      phoneNumber: '+254700000000',
      amountKes: 3500,
      attribution: { channel: 'web', fbclid: 'legacy-id' },
    });

    expect(metaSendEventMock.mock.calls[0][0].advancedMatching.fbc).toMatch(/^fb\.1\.\d{13}\.legacy-id$/);
  });

  /** A WhatsApp order has no browser behind it, so there is no click id to invent. */
  it('sends no click id when there is no attribution at all', async () => {
    await adConversionService.dispatchPurchase({
      businessId: 'biz-1',
      orderId: 'order-1',
      phoneNumber: '+254700000000',
      amountKes: 3500,
      attribution: null,
    });

    const matching = metaSendEventMock.mock.calls[0][0].advancedMatching;
    expect('fbc' in matching).toBe(false);
    expect('fbp' in matching).toBe(false);
    expect(matching.phone).toBe('+254700000000');
  });
});
