import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { reconcileStuckTransactionsMock, recordMock } = vi.hoisted(() => ({
  reconcileStuckTransactionsMock: vi.fn(),
  recordMock: vi.fn(),
}));

vi.mock('@/services/machineTransactionService', () => ({
  machineTransactionService: { reconcileStuckTransactions: reconcileStuckTransactionsMock },
}));

vi.mock('@/repositories/scheduledJobRunRepository', () => ({
  scheduledJobRunRepository: { record: recordMock },
}));

import { GET } from '@/app/api/cron/reconcile-vending-transactions/route';

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

function request(): Request {
  return new Request('http://localhost/api/cron/reconcile-vending-transactions', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

describe('GET /api/cron/reconcile-vending-transactions', () => {
  it('rejects a request missing the Authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/cron/reconcile-vending-transactions'));
    expect(response.status).toBe(401);
    expect(reconcileStuckTransactionsMock).not.toHaveBeenCalled();
  });

  it('rejects every request when CRON_SECRET is not configured (fail closed)', async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new Request('http://localhost/api/cron/reconcile-vending-transactions', { headers: { authorization: 'Bearer anything' } }));
    expect(response.status).toBe(401);
    expect(reconcileStuckTransactionsMock).not.toHaveBeenCalled();
  });

  it('runs the sweep for the current business and reports the count', async () => {
    reconcileStuckTransactionsMock.mockResolvedValue({ movedToManualReview: 3 });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(reconcileStuckTransactionsMock).toHaveBeenCalledWith('snack-quest');
    expect(await response.json()).toEqual({ ok: true, movedToManualReview: 3 });
  });

  it('records a succeeded scheduled job run with the result summary', async () => {
    reconcileStuckTransactionsMock.mockResolvedValue({ movedToManualReview: 0 });

    await GET(request());

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'snack-quest',
        jobName: 'reconcile-vending-transactions',
        status: 'succeeded',
        resultSummary: { movedToManualReview: 0 },
        error: null,
      }),
    );
  });

  it('records a failed scheduled job run and rethrows when the sweep itself throws', async () => {
    reconcileStuckTransactionsMock.mockRejectedValue(new Error('Firestore unavailable'));

    await expect(GET(request())).rejects.toThrow('Firestore unavailable');

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'snack-quest',
        jobName: 'reconcile-vending-transactions',
        status: 'failed',
        resultSummary: null,
        error: 'Firestore unavailable',
      }),
    );
  });
});
