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
        eventName: 'CompletePayment',
        eventSourceUrl: 'https://snackquests.shop/checkout',
        clickId: 'tt-abc',
      }),
    );

    const events = await domainEventsFor('order-web-1');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'ConversionDispatched', payload: { eventName: 'Purchase', provider: 'meta' } }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'ConversionDispatched', payload: { eventName: 'CompletePayment', provider: 'tiktok' } }),
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
      expect.objectContaining({ type: 'ConversionDispatched', payload: { eventName: 'CompletePayment', provider: 'tiktok' } }),
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
