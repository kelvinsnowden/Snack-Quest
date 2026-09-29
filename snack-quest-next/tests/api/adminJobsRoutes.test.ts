import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  record: vi.fn(),
  audit: vi.fn(),
  jobBody: vi.fn(),
  rebuildRange: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ verifyStaffSessionFromRequest: mocks.session }));
vi.mock('@/lib/audit/recordAuditLog', () => ({ recordAuditLog: mocks.audit }));
vi.mock('@/services/jobs/registry', () => ({ loadJobBody: vi.fn(async () => mocks.jobBody) }));
vi.mock('@/services/jobs/rebuildVendingRollups', () => ({ rebuildVendingRollupRange: mocks.rebuildRange }));
vi.mock('@/repositories/scheduledJobRunRepository', async () => ({ scheduledJobRunRepository: (await import('../helpers/jobRunRepositoryMock')).jobRunRepositoryMock(mocks.record) }));

import { POST as runJob } from '@/app/api/admin/jobs/[jobName]/run/route';
import { POST as rebuild } from '@/app/api/vending/rollups/rebuild/route';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';
import { dateKey } from '@/lib/analytics/dateKey';

const ADMIN = { uid: 'staff-1', email: 'a@example.com', displayName: 'A', roles: ['admin'], businessId: 'biz-1' };
const WITHOUT = { ...ADMIN, effectivePermissions: ['settings.view'] };
const run = (jobName: string) => runJob(new Request(`http://localhost/api/admin/jobs/${jobName}/run`, { method: 'POST' }), { params: Promise.resolve({ jobName }) });
const rebuildDays = (body: unknown) => rebuild(new Request('http://localhost/api/vending/rollups/rebuild', { method: 'POST', body: JSON.stringify(body) }));
const daysAgo = (n: number) => dateKey(new Date(Date.now() - n * 24 * 60 * 60 * 1000));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(ADMIN);
  mocks.jobBody.mockResolvedValue({ retried: 3 });
  mocks.rebuildRange.mockResolvedValue({ machineDays: 4 });
  vi.mocked(scheduledJobRunRepository.acquireLease).mockResolvedValue(true);
});

describe('POST /api/admin/jobs/[jobName]/run', () => {
  it('needs a staff session with ops.jobs.run', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await run('retry-notifications')).status).toBe(401);
    mocks.session.mockResolvedValueOnce(WITHOUT);
    const denied = await run('retry-notifications');
    expect(denied.status).toBe(403);
    expect((await denied.json()).permission).toBe('ops.jobs.run');
    expect(mocks.jobBody).not.toHaveBeenCalled();
  });

  it('404s a name that is not a scheduled job, including inherited object keys', async () => {
    expect((await run('drop-everything')).status).toBe(404);
    expect((await run('__proto__')).status).toBe(404);
    expect((await run('constructor')).status).toBe(404);
    expect(mocks.jobBody).not.toHaveBeenCalled();
  });

  it('runs the job as the person who asked, records the run and audits it', async () => {
    const response = await run('retry-notifications');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'succeeded', summary: { retried: 3 } });
    expect(mocks.jobBody).toHaveBeenCalledWith('biz-1', expect.any(Object), 'staff-1');
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'biz-1', jobName: 'retry-notifications', status: 'succeeded' }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'run_scheduled_job', entityType: 'scheduledJob', entityId: 'retry-notifications', actorId: 'staff-1' }));
  });

  it('409s and does nothing while the job is already running', async () => {
    vi.mocked(scheduledJobRunRepository.acquireLease).mockResolvedValueOnce(false);
    expect((await run('retry-notifications')).status).toBe(409);
    expect(mocks.jobBody).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe('POST /api/vending/rollups/rebuild', () => {
  it('needs ops.jobs.run', async () => {
    mocks.session.mockResolvedValueOnce(WITHOUT);
    expect((await rebuildDays({ startDate: daysAgo(5), endDate: daysAgo(1) })).status).toBe(403);
    expect(mocks.rebuildRange).not.toHaveBeenCalled();
  });

  it('refuses malformed, impossible, reversed, unfinished and over-long ranges', async () => {
    for (const body of [
      { startDate: '2026-1-1', endDate: daysAgo(1) },
      { startDate: '2026-02-30', endDate: daysAgo(1) },
      { startDate: daysAgo(1), endDate: daysAgo(3) },
      { startDate: daysAgo(0), endDate: daysAgo(0) },
      { startDate: daysAgo(120), endDate: daysAgo(1) },
    ]) {
      expect((await rebuildDays(body)).status).toBe(400);
    }
    expect(mocks.rebuildRange).not.toHaveBeenCalled();
  });

  it('rebuilds the chosen days under the nightly job’s lease and audits it', async () => {
    const response = await rebuildDays({ startDate: daysAgo(10), endDate: daysAgo(1) });
    expect(response.status).toBe(200);
    expect(mocks.rebuildRange).toHaveBeenCalledWith('biz-1', expect.any(Object), { startDate: daysAgo(10), endDate: daysAgo(1) });
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ jobName: 'rebuild-vending-rollups', status: 'succeeded' }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ action: 'rebuild_vending_analytics', after: expect.objectContaining({ startDate: daysAgo(10), endDate: daysAgo(1) }) }));
  });

  it('409s while the nightly rebuild is running', async () => {
    vi.mocked(scheduledJobRunRepository.acquireLease).mockResolvedValueOnce(false);
    expect((await rebuildDays({ startDate: daysAgo(3), endDate: daysAgo(1) })).status).toBe(409);
    expect(mocks.rebuildRange).not.toHaveBeenCalled();
  });
});
