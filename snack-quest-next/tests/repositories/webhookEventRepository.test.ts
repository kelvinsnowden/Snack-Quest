import { beforeEach, describe, expect, it } from 'vitest';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { adminFirestore } from '@/lib/firebase/admin';

/**
 * Validates the actual dedup mechanism (Firestore `create()` rejecting
 * an existing doc, detected via error code 6) rather than just the
 * shape of the code — this is the one piece of `recordIfNew` that's
 * easy to get subtly wrong (a `get()`-then-`set()` race instead of an
 * atomic check-and-create) and worth exercising for real. Also proves
 * two tenants can never collide on the same provider event ID.
 */

const BUSINESS_ID = 'biz-1';
const OTHER_BUSINESS_ID = 'biz-2';

beforeEach(async () => {
  const snapshot = await adminFirestore.collection('webhookEvents').get();
  await Promise.all(snapshot.docs.map((d) => d.ref.delete()));
});

describe('webhookEventRepository', () => {
  it('records a new event and reports isNew: true', async () => {
    const result = await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'daraja',
      providerEventId: 'evt-1',
      payload: { CheckoutRequestID: 'abc' },
    });
    expect(result.isNew).toBe(true);

    const doc = await adminFirestore
      .collection('webhookEvents')
      .doc(`${BUSINESS_ID}:daraja:evt-1`)
      .get();
    expect(doc.exists).toBe(true);
    expect(doc.data()?.status).toBe('received');
  });

  it('reports isNew: false on a duplicate delivery, without throwing', async () => {
    await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'daraja',
      providerEventId: 'evt-2',
      payload: { CheckoutRequestID: 'abc' },
    });

    const second = await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'daraja',
      providerEventId: 'evt-2',
      payload: { CheckoutRequestID: 'abc-redelivered' },
    });
    expect(second.isNew).toBe(false);

    // The redelivered payload must NOT have overwritten the original.
    const doc = await adminFirestore
      .collection('webhookEvents')
      .doc(`${BUSINESS_ID}:daraja:evt-2`)
      .get();
    expect(doc.data()?.payload).toEqual({ CheckoutRequestID: 'abc' });
  });

  it('does not collide across providers reusing the same providerEventId', async () => {
    const a = await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'daraja',
      providerEventId: 'shared-id',
      payload: {},
    });
    const b = await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'whatchimp',
      providerEventId: 'shared-id',
      payload: {},
    });
    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(true);
  });

  it('does not collide across businesses reusing the same provider + providerEventId', async () => {
    const a = await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'daraja',
      providerEventId: 'cross-tenant-id',
      payload: {},
    });
    const b = await webhookEventRepository.recordIfNew({
      businessId: OTHER_BUSINESS_ID,
      provider: 'daraja',
      providerEventId: 'cross-tenant-id',
      payload: {},
    });
    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(true);
  });

  it('markProcessed transitions status and sets processedAt', async () => {
    await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'jumia',
      providerEventId: 'evt-3',
      payload: {},
    });
    await webhookEventRepository.markProcessed(BUSINESS_ID, 'jumia', 'evt-3');

    const doc = await adminFirestore
      .collection('webhookEvents')
      .doc(`${BUSINESS_ID}:jumia:evt-3`)
      .get();
    expect(doc.data()?.status).toBe('processed');
    expect(doc.data()?.processedAt).not.toBeNull();
  });

  it('markFailed transitions status and records the error', async () => {
    await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'jumia',
      providerEventId: 'evt-4',
      payload: {},
    });
    await webhookEventRepository.markFailed(
      BUSINESS_ID,
      'jumia',
      'evt-4',
      'signature mismatch',
    );

    const doc = await adminFirestore
      .collection('webhookEvents')
      .doc(`${BUSINESS_ID}:jumia:evt-4`)
      .get();
    expect(doc.data()?.status).toBe('failed');
    expect(doc.data()?.error).toBe('signature mismatch');
  });
});
