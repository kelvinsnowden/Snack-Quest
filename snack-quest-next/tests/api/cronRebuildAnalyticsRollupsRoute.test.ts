import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rebuildTrafficRangeMock, rebuildCustomerLifetimeMock, recordMock } = vi.hoisted(() => ({
  rebuildTrafficRangeMock: vi.fn(),
  rebuildCustomerLifetimeMock: vi.fn(),
  recordMock: vi.fn(),
}));

vi.mock('@/services/analyticsRollupService', () => ({
  analyticsRollupService: {
    rebuildTrafficRange: rebuildTrafficRangeMock,
    rebuildCustomerLifetime: rebuildCustomerLifetimeMock,
  },
}));

vi.mock('@/repositories/scheduledJobRunRepository', () => ({
  scheduledJobRunRepository: { record: recordMock },
}));

import { GET } from '@/app/api/cron/rebuild-analytics-rollups/route';

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

describe('GET /api/cron/rebuild-analytics-rollups', () => {
  it('rejects a request missing the Authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/cron/rebuild-analytics-rollups'));

    expect(response.status).toBe(401);
    expect(rebuildTrafficRangeMock).not.toHaveBeenCalled();
    expect(rebuildCustomerLifetimeMock).not.toHaveBeenCalled();
  });

  it('rejects a request with the wrong bearer token', async () => {
    const response = await GET(
      new Request('http://localhost/api/cron/rebuild-analytics-rollups', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );

    expect(response.status).toBe(401);
    expect(rebuildTrafficRangeMock).not.toHaveBeenCalled();
  });

  it('rejects every request when CRON_SECRET is not configured (fail closed)', async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(
      new Request('http://localhost/api/cron/rebuild-analytics-rollups', {
        headers: { authorization: 'Bearer anything' },
      }),
    );

    expect(response.status).toBe(401);
  });

  it('rebuilds both rollups for the current business on a valid bearer token', async () => {
    rebuildTrafficRangeMock.mockResolvedValue({ days: 3, visits: 450 });
    rebuildCustomerLifetimeMock.mockResolvedValue({ customerCount: 24 });

    const response = await GET(
      new Request('http://localhost/api/cron/rebuild-analytics-rollups', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      traffic: { days: 3, visits: 450 },
      lifetime: { customerCount: 24 },
    });
    expect(rebuildTrafficRangeMock).toHaveBeenCalledWith(
      'snack-quest',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(rebuildCustomerLifetimeMock).toHaveBeenCalledWith('snack-quest');
  });

  /* Three days back, not one — see the route's own doc comment for why. */
  it('rebuilds a three-day traffic window ending today', async () => {
    rebuildTrafficRangeMock.mockResolvedValue({ days: 3, visits: 0 });
    rebuildCustomerLifetimeMock.mockResolvedValue({ customerCount: 0 });

    await GET(
      new Request('http://localhost/api/cron/rebuild-analytics-rollups', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    );

    const [, startDate, endDate] = rebuildTrafficRangeMock.mock.calls[0];
    const dayMs = 24 * 60 * 60 * 1000;
    const spanDays = Math.round(
      (new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime()) /
        dayMs,
    );
    expect(spanDays).toBe(3);
    expect(endDate).toBe(new Date().toISOString().slice(0, 10));
  });

  it('records a succeeded scheduled job run (§ Phase 5: Observability)', async () => {
    rebuildTrafficRangeMock.mockResolvedValue({ days: 3, visits: 12 });
    rebuildCustomerLifetimeMock.mockResolvedValue({ customerCount: 5 });

    await GET(
      new Request('http://localhost/api/cron/rebuild-analytics-rollups', {
        headers: { authorization: 'Bearer test-cron-secret' },
      }),
    );

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'snack-quest',
        jobName: 'rebuild-analytics-rollups',
        status: 'succeeded',
        resultSummary: { traffic: { days: 3, visits: 12 }, lifetime: { customerCount: 5 } },
        error: null,
      }),
    );
  });

  it('records a failed scheduled job run and rethrows when a rebuild throws', async () => {
    rebuildTrafficRangeMock.mockRejectedValue(new Error('Firestore unavailable'));
    rebuildCustomerLifetimeMock.mockResolvedValue({ customerCount: 0 });

    await expect(
      GET(
        new Request('http://localhost/api/cron/rebuild-analytics-rollups', {
          headers: { authorization: 'Bearer test-cron-secret' },
        }),
      ),
    ).rejects.toThrow('Firestore unavailable');

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'snack-quest',
        jobName: 'rebuild-analytics-rollups',
        status: 'failed',
        resultSummary: null,
        error: 'Firestore unavailable',
      }),
    );
  });
});
