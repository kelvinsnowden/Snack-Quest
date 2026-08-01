import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { reconcileStuckIntentsMock, handlePaymentResultMock, notifyAdminMock, recordMock } = vi.hoisted(() => ({
  reconcileStuckIntentsMock: vi.fn(),
  handlePaymentResultMock: vi.fn(),
  notifyAdminMock: vi.fn(),
  recordMock: vi.fn(),
}));

vi.mock('@/services/paymentService', () => ({
  paymentService: { reconcileStuckIntents: reconcileStuckIntentsMock },
}));

vi.mock('@/services/conversationService', () => ({
  conversationService: { handlePaymentResult: handlePaymentResultMock },
}));

vi.mock('@/services/notificationService', () => ({
  notificationService: { notifyAdmin: notifyAdminMock },
}));

vi.mock('@/repositories/scheduledJobRunRepository', () => ({
  scheduledJobRunRepository: { record: recordMock },
}));

import { GET } from '@/app/api/cron/reconcile-stk-payments/route';

const ORIGINAL_SECRET = process.env.CRON_SECRET;
const ORIGINAL_BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.SNACK_QUEST_BUSINESS_ID = 'snack-quest';
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_SECRET;
  }
  if (ORIGINAL_BUSINESS_ID === undefined) {
    delete process.env.SNACK_QUEST_BUSINESS_ID;
  } else {
    process.env.SNACK_QUEST_BUSINESS_ID = ORIGINAL_BUSINESS_ID;
  }
});

describe('GET /api/cron/reconcile-stk-payments', () => {
  it('rejects a request missing the Authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/cron/reconcile-stk-payments'));
    expect(response.status).toBe(401);
    expect(reconcileStuckIntentsMock).not.toHaveBeenCalled();
  });

  it('rejects every request when CRON_SECRET is not configured (fail closed)', async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(
      new Request('http://localhost/api/cron/reconcile-stk-payments', {
        headers: { authorization: 'Bearer anything' },
      }),
    );
    expect(response.status).toBe(401);
    expect(reconcileStuckIntentsMock).not.toHaveBeenCalled();
  });

  it('calls handlePaymentResult for a confirmedFailed outcome, exactly like a real callback', async () => {
    const callbackResult = { status: 'failed', intentId: 'intent-1', conversationId: 'conv-1', snapshotId: 'snap-1', reason: 'Request cancelled by user.' };
    reconcileStuckIntentsMock.mockResolvedValue([
      { intentId: 'intent-1', checkoutRequestId: 'checkout-1', outcome: 'confirmedFailed', callbackResult },
    ]);

    const response = await GET(
      new Request('http://localhost/api/cron/reconcile-stk-payments', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    );

    expect(response.status).toBe(200);
    expect(handlePaymentResultMock).toHaveBeenCalledWith(callbackResult);
    expect(notifyAdminMock).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      ok: true,
      checked: 1,
      confirmedFailed: 1,
      needsManualReview: 0,
      stillPending: 0,
    });
  });

  it('notifies the admin for a needsManualReview outcome instead of touching the conversation', async () => {
    reconcileStuckIntentsMock.mockResolvedValue([
      {
        intentId: 'intent-2',
        checkoutRequestId: 'checkout-2',
        outcome: 'needsManualReview',
        reviewReason: 'Daraja confirms success but no receipt arrived.',
      },
    ]);

    await GET(
      new Request('http://localhost/api/cron/reconcile-stk-payments', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    );

    expect(handlePaymentResultMock).not.toHaveBeenCalled();
    expect(notifyAdminMock).toHaveBeenCalledWith(
      'snack-quest',
      expect.stringContaining('Daraja confirms success but no receipt arrived.'),
    );
  });

  it('does nothing extra for a stillPending outcome', async () => {
    reconcileStuckIntentsMock.mockResolvedValue([
      { intentId: 'intent-3', checkoutRequestId: 'checkout-3', outcome: 'stillPending' },
    ]);

    await GET(
      new Request('http://localhost/api/cron/reconcile-stk-payments', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    );

    expect(handlePaymentResultMock).not.toHaveBeenCalled();
    expect(notifyAdminMock).not.toHaveBeenCalled();
  });

  it('records a succeeded scheduled job run with a summary', async () => {
    reconcileStuckIntentsMock.mockResolvedValue([
      { intentId: 'i1', checkoutRequestId: 'c1', outcome: 'confirmedFailed', callbackResult: { status: 'failed', intentId: 'i1', conversationId: 'c', snapshotId: 's', reason: 'r' } },
      { intentId: 'i2', checkoutRequestId: 'c2', outcome: 'needsManualReview', reviewReason: 'r' },
      { intentId: 'i3', checkoutRequestId: 'c3', outcome: 'stillPending' },
    ]);

    await GET(
      new Request('http://localhost/api/cron/reconcile-stk-payments', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    );

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'snack-quest',
        jobName: 'reconcile-stk-payments',
        status: 'succeeded',
        resultSummary: { checked: 3, confirmedFailed: 1, needsManualReview: 1, stillPending: 1 },
        error: null,
      }),
    );
  });

  it('records a failed scheduled job run and rethrows when the sweep itself throws', async () => {
    reconcileStuckIntentsMock.mockRejectedValue(new Error('Firestore unavailable'));

    await expect(
      GET(
        new Request('http://localhost/api/cron/reconcile-stk-payments', {
          headers: { authorization: 'Bearer test-cron-secret' },
        }),
      ),
    ).rejects.toThrow('Firestore unavailable');

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'snack-quest',
        jobName: 'reconcile-stk-payments',
        status: 'failed',
        resultSummary: null,
        error: 'Firestore unavailable',
      }),
    );
  });
});
