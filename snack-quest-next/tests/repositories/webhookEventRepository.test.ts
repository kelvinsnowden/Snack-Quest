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
      eventKind: 'stk_callback',
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
      eventKind: 'stk_callback',
      providerEventId: 'evt-2',
      payload: { CheckoutRequestID: 'abc' },
    });

    const second = await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'daraja',
      eventKind: 'stk_callback',
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
      eventKind: 'stk_callback',
      providerEventId: 'shared-id',
      payload: {},
    });
    const b = await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'whatchimp',
      eventKind: 'inbound_message',
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
      eventKind: 'stk_callback',
      providerEventId: 'cross-tenant-id',
      payload: {},
    });
    const b = await webhookEventRepository.recordIfNew({
      businessId: OTHER_BUSINESS_ID,
      provider: 'daraja',
      eventKind: 'stk_callback',
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
      eventKind: 'inbound_message',
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
      eventKind: 'inbound_message',
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

describe('webhookEventRepository.listUnmatchedPayments', () => {
  it('lists only failed stk_callback events for the business, newest first', async () => {
    // Not an unmatched payment: a failed B2C result, even with no relatedEntityId.
    await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'daraja',
      eventKind: 'b2c_result',
      providerEventId: 'b2c-evt-1',
      payload: {},
    });
    await webhookEventRepository.markFailed(BUSINESS_ID, 'daraja', 'b2c-evt-1', 'no matching withdrawal');

    // Not an unmatched payment: a successfully processed stk_callback.
    await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'daraja',
      eventKind: 'stk_callback',
      providerEventId: 'stk-evt-processed',
      payload: {},
    });
    await webhookEventRepository.markProcessed(BUSINESS_ID, 'daraja', 'stk-evt-processed');

    // Not an unmatched payment: a different business.
    await webhookEventRepository.recordIfNew({
      businessId: OTHER_BUSINESS_ID,
      provider: 'daraja',
      eventKind: 'stk_callback',
      providerEventId: 'stk-evt-other-biz',
      payload: {},
    });
    await webhookEventRepository.markFailed(OTHER_BUSINESS_ID, 'daraja', 'stk-evt-other-biz', 'unmatched payment');

    // The real thing: a failed stk_callback for this business.
    await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'daraja',
      eventKind: 'stk_callback',
      providerEventId: 'stk-evt-unmatched',
      payload: { Body: { stkCallback: { CheckoutRequestID: 'stk-evt-unmatched' } } },
    });
    await webhookEventRepository.markFailed(BUSINESS_ID, 'daraja', 'stk-evt-unmatched', 'No matching payment attempt found (unmatched payment)');

    const { events, nextCursor } = await webhookEventRepository.listUnmatchedPayments(BUSINESS_ID);

    expect(events).toHaveLength(1);
    expect(events[0].data.providerEventId).toBe('stk-evt-unmatched');
    expect(nextCursor).toBeNull();
  });
});

describe('webhookEventRepository.markResolved', () => {
  it('records who resolved the event, when, and why', async () => {
    await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'daraja',
      eventKind: 'stk_callback',
      providerEventId: 'stk-evt-to-resolve',
      payload: {},
    });
    await webhookEventRepository.markFailed(BUSINESS_ID, 'daraja', 'stk-evt-to-resolve', 'unmatched payment');

    await webhookEventRepository.markResolved(
      BUSINESS_ID,
      'daraja',
      'stk-evt-to-resolve',
      'staff-1',
      'Verified against M-Pesa statement — duplicate customer payment, refunded manually via till.',
    );

    const doc = await adminFirestore
      .collection('webhookEvents')
      .doc(`${BUSINESS_ID}:daraja:stk-evt-to-resolve`)
      .get();
    expect(doc.data()?.resolvedBy).toBe('staff-1');
    expect(doc.data()?.resolvedAt).not.toBeNull();
    expect(doc.data()?.resolutionNote).toBe(
      'Verified against M-Pesa statement — duplicate customer payment, refunded manually via till.',
    );
  });
});
