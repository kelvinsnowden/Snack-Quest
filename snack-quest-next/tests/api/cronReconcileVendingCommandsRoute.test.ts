import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { reconcileStuckCommandsMock, sweepTimedOutMock, probeMock, recordMock } = vi.hoisted(() => ({
  reconcileStuckCommandsMock: vi.fn(),
  sweepTimedOutMock: vi.fn(),
  probeMock: vi.fn(),
  recordMock: vi.fn(),
}));

vi.mock('@/services/machineCommandService', () => ({
  machineCommandService: { reconcileStuckCommands: reconcileStuckCommandsMock },
}));

vi.mock('@/services/dispenseCommandService', () => ({
  dispenseCommandService: { sweepTimedOut: sweepTimedOutMock },
}));

vi.mock('@/services/machineIntegrationService', () => ({
  machineIntegrationService: { probeActiveOutboundIntegrations: probeMock },
}));

vi.mock('@/repositories/scheduledJobRunRepository', () => ({
  scheduledJobRunRepository: { record: recordMock },
}));

import { GET } from '@/app/api/cron/reconcile-vending-commands/route';

const ORIGINAL_SECRET = process.env.CRON_SECRET;
const ORIGINAL_BUSINESS_ID = process.env.SNACK_QUEST_BUSINESS_ID;

beforeEach(() => {
  vi.clearAllMocks();
  sweepTimedOutMock.mockResolvedValue({ timedOut: 0 });
  probeMock.mockResolvedValue({ probed: 0, failed: 0 });
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
  return new Request('http://localhost/api/cron/reconcile-vending-commands', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

describe('GET /api/cron/reconcile-vending-commands', () => {
  it('rejects a request missing the Authorization header', async () => {
    const response = await GET(new Request('http://localhost/api/cron/reconcile-vending-commands'));
    expect(response.status).toBe(401);
    expect(reconcileStuckCommandsMock).not.toHaveBeenCalled();
  });

  it('rejects every request when CRON_SECRET is not configured (fail closed)', async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(new Request('http://localhost/api/cron/reconcile-vending-commands', { headers: { authorization: 'Bearer anything' } }));
    expect(response.status).toBe(401);
    expect(reconcileStuckCommandsMock).not.toHaveBeenCalled();
  });

  it('runs every sweep for the current business and reports the merged counts', async () => {
    reconcileStuckCommandsMock.mockResolvedValue({ expired: 2 });
    sweepTimedOutMock.mockResolvedValue({ timedOut: 1 });
    probeMock.mockResolvedValue({ probed: 3, failed: 1 });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(reconcileStuckCommandsMock).toHaveBeenCalledWith('snack-quest');
    expect(sweepTimedOutMock).toHaveBeenCalledWith('snack-quest');
    expect(probeMock).toHaveBeenCalledWith('snack-quest');
    expect(await response.json()).toEqual({ ok: true, expired: 2, dispenseTimedOut: 1, integrationsProbed: 3, integrationProbesFailed: 1 });
  });

  it('records a succeeded scheduled job run with the result summary', async () => {
    reconcileStuckCommandsMock.mockResolvedValue({ expired: 0 });

    await GET(request());

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'snack-quest',
        jobName: 'reconcile-vending-commands',
        status: 'succeeded',
        resultSummary: { expired: 0, dispenseTimedOut: 0, integrationsProbed: 0, integrationProbesFailed: 0 },
        error: null,
      }),
    );
  });

  it('records a failed scheduled job run and rethrows when the sweep itself throws', async () => {
    reconcileStuckCommandsMock.mockRejectedValue(new Error('Firestore unavailable'));

    await expect(GET(request())).rejects.toThrow('Firestore unavailable');

    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'snack-quest',
        jobName: 'reconcile-vending-commands',
        status: 'failed',
        resultSummary: null,
        error: 'Firestore unavailable',
      }),
    );
  });
});
