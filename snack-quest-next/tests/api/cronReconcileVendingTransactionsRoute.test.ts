import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { reconcileStuckTransactionsMock, reconcileStuckPendingTransactionsMock, reconcileUnknownDispensesMock, recordMock } = vi.hoisted(() => ({
  reconcileStuckTransactionsMock: vi.fn(),
  reconcileStuckPendingTransactionsMock: vi.fn(),
  reconcileUnknownDispensesMock: vi.fn(),
  recordMock: vi.fn(),
}));

vi.mock('@/services/machineTransactionService', () => ({
  machineTransactionService: {
    reconcileStuckTransactions: reconcileStuckTransactionsMock,
    reconcileStuckPendingTransactions: reconcileStuckPendingTransactionsMock,
    reconcileUnknownDispenses: reconcileUnknownDispensesMock,
  },
}));

vi.mock('@/services/dispenseRecoveryService', () => ({
  dispenseRecoveryService: { sweep: vi.fn().mockResolvedValue({ examined: 0, recovered: {} }) },
}));

vi.mock('@/services/deepReconciliationService', () => ({
  deepReconciliationService: { run: vi.fn().mockResolvedValue({ discrepancies: [] }) },
}));

vi.mock('@/repositories/scheduledJobRunRepository', async () => ({ scheduledJobRunRepository: (await import('../helpers/jobRunRepositoryMock')).jobRunRepositoryMock(recordMock) }));

import { GET } from '@/app/api/cron/reconcile-vending-transactions/route';

const ORIGINAL_SECRET = process.env.CRON_SECRET;
const ORIGINAL_BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID;

beforeEach(() => {
  vi.clearAllMocks();
  reconcileUnknownDispensesMock.mockResolvedValue({ resolved: 0, stillUnknown: 0 });
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

  it('runs both sweeps for the current business and reports the merged count', async () => {
    reconcileStuckTransactionsMock.mockResolvedValue({ movedToManualReview: 3 });
    reconcileStuckPendingTransactionsMock.mockResolvedValue({
      resolvedFailed: 1,
      flaggedForManualReview: 2,
      stillPending: 4,
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(reconcileStuckTransactionsMock).toHaveBeenCalledWith('snack-quest');
    expect(reconcileStuckPendingTransactionsMock).toHaveBeenCalledWith('snack-quest');
    expect(await response.json()).toMatchObject({
      ok: true,
      movedToManualReview: 3,
      resolvedFailed: 1,
      flaggedForManualReview: 2,
      stillPending: 4,
      dispensesResolved: 0,
      dispensesStillUnknown: 0,
      recoveryExamined: 0,
      ledgerDiscrepancies: 0,
    });
  });

  it('records a succeeded scheduled job run with the merged result summary', async () => {
    reconcileStuckTransactionsMock.mockResolvedValue({ movedToManualReview: 0 });
    reconcileStuckPendingTransactionsMock.mockResolvedValue({
      resolvedFailed: 0,
      flaggedForManualReview: 0,
      stillPending: 0,
    });

    await GET(request());

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'snack-quest',
        jobName: 'reconcile-vending-transactions',
        status: 'succeeded',
        resultSummary: {
          movedToManualReview: 0,
          resolvedFailed: 0,
          flaggedForManualReview: 0,
          stillPending: 0,
          dispensesResolved: 0,
          dispensesStillUnknown: 0,
          recoveryExamined: 0,
          ledgerDiscrepancies: 0,
        },
        error: null,
      }),
    );
  });

  it('records a partial scheduled job run and answers 500 when either sweep throws', async () => {
    reconcileStuckTransactionsMock.mockRejectedValue(new Error('Firestore unavailable'));
    reconcileStuckPendingTransactionsMock.mockResolvedValue({
      resolvedFailed: 0,
      flaggedForManualReview: 0,
      stillPending: 0,
    });

    expect((await GET(request())).status).toBe(500);

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'snack-quest',
        jobName: 'reconcile-vending-transactions',
        status: 'partial',
        error: 'Firestore unavailable',
      }),
    );
  });
});
