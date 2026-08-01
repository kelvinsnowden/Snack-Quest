import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { retrySweepMock, recordMock } = vi.hoisted(() => ({ retrySweepMock: vi.fn(), recordMock: vi.fn() }));

vi.mock('@/services/notificationService', () => ({
  notificationService: { retrySweep: retrySweepMock },
}));

vi.mock('@/repositories/scheduledJobRunRepository', () => ({
  scheduledJobRunRepository: { record: recordMock },
}));

import { GET } from '@/app/api/cron/retry-notifications/route';

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

describe('GET /api/cron/retry-notifications', () => {
  it('rejects a request missing the Authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/cron/retry-notifications'));

    expect(response.status).toBe(401);
    expect(retrySweepMock).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong bearer token', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/retry-notifications', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );

    expect(response.status).toBe(401);
    expect(retrySweepMock).not.toHaveBeenCalled();
  });

  it('rejects every request when CRON_SECRET is not configured (fail closed)', async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(
      new Request('http://localhost/api/cron/retry-notifications', {
        headers: { authorization: 'Bearer anything' },
      }),
    );

    expect(response.status).toBe(401);
    expect(retrySweepMock).not.toHaveBeenCalled();
  });

  it('runs the retry sweep for the current business on a valid bearer token', async () => {
    retrySweepMock.mockResolvedValue({ attempted: 3 });

    const response = await GET(
      new Request('http://localhost/api/cron/retry-notifications', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, attempted: 3 });
    expect(retrySweepMock).toHaveBeenCalledWith('snack-quest');
  });

  it('records a succeeded scheduled job run (§ Phase 5: Observability)', async () => {
    retrySweepMock.mockResolvedValue({ attempted: 2 });

    await GET(
      new Request('http://localhost/api/cron/retry-notifications', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    );

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'snack-quest',
        jobName: 'retry-notifications',
        status: 'succeeded',
        resultSummary: { attempted: 2 },
        error: null,
      }),
    );
  });

  it('records a failed scheduled job run and rethrows when the sweep itself throws', async () => {
    retrySweepMock.mockRejectedValue(new Error('Firestore unavailable'));

    await expect(
      GET(
        new Request('http://localhost/api/cron/retry-notifications', {
          headers: { authorization: 'Bearer test-cron-secret' },
        }),
      ),
    ).rejects.toThrow('Firestore unavailable');

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'snack-quest',
        jobName: 'retry-notifications',
        status: 'failed',
        resultSummary: null,
        error: 'Firestore unavailable',
      }),
    );
  });
});
