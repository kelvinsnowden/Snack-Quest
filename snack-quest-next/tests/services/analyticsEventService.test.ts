import { beforeEach, describe, expect, it } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { analyticsEventService, AnalyticsEventValidationError } from '@/services/analyticsEventService';
import { RESCUE_OFFER_EVENTS } from '@/lib/analytics/rescueOfferEvents';

const BUSINESS_ID = 'biz-analytics-event-service-test';

beforeEach(async () => {
  await adminFirestore.recursiveDelete(adminFirestore.collection('analyticsEvents'));
});

describe('AnalyticsEventService.record', () => {
  it('rejects an event name outside the known set', async () => {
    await expect(
      analyticsEventService.record(BUSINESS_ID, { event: 'made_up_event', visitorId: 'v1' }),
    ).rejects.toBeInstanceOf(AnalyticsEventValidationError);
  });

  it('records a known event with its metadata', async () => {
    await analyticsEventService.record(BUSINESS_ID, {
      event: RESCUE_OFFER_EVENTS.popupShown,
      visitorId: 'visitor-1',
      metadata: { packageId: 'pkg-1' },
    });

    const snapshot = await adminFirestore.collection('analyticsEvents').get();
    expect(snapshot.size).toBe(1);
    expect(snapshot.docs[0].data()).toMatchObject({
      businessId: BUSINESS_ID,
      event: RESCUE_OFFER_EVENTS.popupShown,
      visitorId: 'visitor-1',
      metadata: { packageId: 'pkg-1' },
    });
  });

  it('accepts a null visitorId — the server-fired purchase-completed event has no cookie context', async () => {
    await analyticsEventService.record(BUSINESS_ID, {
      event: RESCUE_OFFER_EVENTS.purchaseCompleted,
      visitorId: null,
      metadata: { orderId: 'order-1', amountKes: 1500 },
    });

    const snapshot = await adminFirestore.collection('analyticsEvents').get();
    expect(snapshot.docs[0].data().visitorId).toBeNull();
  });

  it('drops metadata entries beyond the string/number/boolean types and truncates long strings', async () => {
    await analyticsEventService.record(BUSINESS_ID, {
      event: RESCUE_OFFER_EVENTS.offerClicked,
      visitorId: 'visitor-1',
      metadata: {
        packageId: 'a'.repeat(500),
        // @ts-expect-error — deliberately passing a disallowed type to prove it's dropped, not stored raw.
        nested: { not: 'allowed' },
      },
    });

    const snapshot = await adminFirestore.collection('analyticsEvents').get();
    const stored = snapshot.docs[0].data();
    expect(stored.metadata.packageId).toHaveLength(200);
    expect(stored.metadata.nested).toBeUndefined();
  });
});
