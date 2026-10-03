import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sweep: vi.fn(),
  reconcileUnknownDispenses: vi.fn(),
  evaluateAndSync: vi.fn(),
  notifyCritical: vi.fn(),
  record: vi.fn(),
}));

vi.mock('@/services/dispenseRecoveryService', () => ({ dispenseRecoveryService: { sweep: mocks.sweep } }));
vi.mock('@/services/machineTransactionService', () => ({ machineTransactionService: { reconcileUnknownDispenses: mocks.reconcileUnknownDispenses } }));
vi.mock('@/services/alertService', () => ({ alertService: { evaluateAndSync: mocks.evaluateAndSync, notifyCritical: mocks.notifyCritical } }));
vi.mock('@/repositories/scheduledJobRunRepository', async () => ({ scheduledJobRunRepository: (await import('../helpers/jobRunRepositoryMock')).jobRunRepositoryMock(mocks.record) }));

import { GET } from '@/app/api/cron/vending-fast-recovery/route';

const authorized = () => new Request('http://localhost/api/cron/vending-fast-recovery', { headers: { authorization: 'Bearer fast-secret' } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'fast-secret';
  process.env.SNACK_QUEST_BUSINESS_ID = 'snack-quest';
  mocks.sweep.mockResolvedValue({ examined: 2, recovered: { refunded_never_collected: 1 } });
  mocks.reconcileUnknownDispenses.mockResolvedValue({ resolved: 0, stillUnknown: 1 });
  mocks.notifyCritical.mockResolvedValue({ notified: 1, digest: false });
});

describe('GET /api/cron/vending-fast-recovery', () => {
  it('refuses without the cron secret', async () => {
    expect((await GET(new Request('http://localhost/api/cron/vending-fast-recovery'))).status).toBe(401);
    expect(mocks.sweep).not.toHaveBeenCalled();
  });

  it('recovers, pulls outbound unknowns, sweeps alerts and texts critical ones', async () => {
    const response = await GET(authorized());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, examined: 2, refunded_never_collected: 1, pulledStillUnknown: 1, alertsNotified: 1 });
    expect(mocks.evaluateAndSync).toHaveBeenCalledWith('snack-quest');
  });

  it('a failed text does not stop recovery: the run is recorded as partial, with the reason', async () => {
    mocks.notifyCritical.mockRejectedValue(new Error('sms gateway down'));
    const response = await GET(authorized());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, status: 'partial', examined: 2, refunded_never_collected: 1, alertsNotified: null, errors: [{ step: 'critical alert texts', message: 'sms gateway down' }] });
    expect(mocks.evaluateAndSync).toHaveBeenCalled();
  });

  it('one step failing still runs the others (per-step isolation)', async () => {
    mocks.sweep.mockRejectedValue(new Error('firestore down'));
    const response = await GET(authorized());
    expect(await response.json()).toMatchObject({ status: 'partial', pulledStillUnknown: 1, alertsNotified: 1 });
  });

  it('records a partial run and 500s when recovery itself fails', async () => {
    mocks.sweep.mockRejectedValue(new Error('firestore down'));
    const response = await GET(authorized());
    expect(response.status).toBe(500);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ jobName: 'vending-fast-recovery', status: 'partial' }));
  });
});
