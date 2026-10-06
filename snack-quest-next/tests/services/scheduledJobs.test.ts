import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { classify, scheduledJobService } from '@/services/scheduledJobService';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';
import { alertService } from '@/services/alertService';
import type { ScheduledJobRun } from '@/types';

/**
 * Scheduled jobs are observable (a run record exists from the moment a
 * run starts), safe to overlap (a lease; the loser is recorded as
 * skipped), failure-tolerant (steps are isolated) and alerting (failed,
 * abandoned and overdue jobs become alerts that clear on the next good
 * run).
 */

const BUSINESS_ID = 'biz-scheduled-jobs';
const runsOf = async (jobName: string) =>
  (await adminFirestore.collection('scheduledJobRuns').where('businessId', '==', BUSINESS_ID).where('jobName', '==', jobName).get()).docs.map((doc) => doc.data() as ScheduledJobRun);

beforeEach(async () => {
  for (const collection of ['scheduledJobRuns', 'scheduledJobLeases', 'alerts']) {
    await adminFirestore.recursiveDelete(adminFirestore.collection(collection));
  }
});

describe('running a job', () => {
  it('writes the running record before any work, and finishes it with status, summary and duration', async () => {
    let seenWhileRunning: ScheduledJobRun[] = [];
    const outcome = await scheduledJobService.run(BUSINESS_ID, 'retry-notifications', async (job) => {
      seenWhileRunning = await runsOf('retry-notifications');
      const result = await job.step('sweep', async () => ({ attempted: 4 }));
      return { ...result };
    });
    expect(seenWhileRunning.map((run) => run.status)).toEqual(['running']);
    expect(outcome.status).toBe('succeeded');
    const [run] = await runsOf('retry-notifications');
    expect(run).toMatchObject({ status: 'succeeded', resultSummary: { attempted: 4 }, error: null, errors: [] });
    expect(run.finishedAt).toBeTruthy();
    expect(run.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('isolates steps: one failing is recorded and the rest still run (partial); all failing is failed', async () => {
    const ran: string[] = [];
    const partial = await scheduledJobService.run(BUSINESS_ID, 'reconcile-vending-commands', async (job) => {
      await job.step('a', async () => ran.push('a'));
      await job.step('b', async () => { throw new Error('b broke'); });
      await job.step('c', async () => ran.push('c'));
      return {};
    });
    expect(ran).toEqual(['a', 'c']);
    expect(partial).toMatchObject({ status: 'partial', errors: [{ step: 'b', message: 'b broke' }] });

    const failed = await scheduledJobService.run(BUSINESS_ID, 'reconcile-vending-commands', async (job) => {
      await job.step('a', async () => { throw new Error('down'); });
      return {};
    });
    expect(failed.status).toBe('failed');
  });

  it('overlapping runs: the second is skipped (and recorded), not run twice', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let executions = 0;
    const first = scheduledJobService.run(BUSINESS_ID, 'vending-fast-recovery', async () => {
      executions += 1;
      await gate;
      return {};
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const second = await scheduledJobService.run(BUSINESS_ID, 'vending-fast-recovery', async () => {
      executions += 1;
      return {};
    });
    release();
    expect((await first).status).toBe('succeeded');
    expect(second.status).toBe('skipped');
    expect(executions).toBe(1);
    expect((await runsOf('vending-fast-recovery')).map((run) => run.status).sort()).toEqual(['skipped', 'succeeded']);
    // The lease is released at the end: the next run goes ahead.
    expect((await scheduledJobService.run(BUSINESS_ID, 'vending-fast-recovery', async () => ({}))).status).toBe('succeeded');
  });

  it('a run killed mid-way never blocks the job forever: its lease expires', async () => {
    const now = Date.now();
    expect(await scheduledJobRunRepository.acquireLease(BUSINESS_ID, 'rebuild-vending-rollups', 'crashed-run', 60_000, now)).toBe(true);
    expect(await scheduledJobRunRepository.acquireLease(BUSINESS_ID, 'rebuild-vending-rollups', 'next-run', 60_000, now + 30_000)).toBe(false);
    expect(await scheduledJobRunRepository.acquireLease(BUSINESS_ID, 'rebuild-vending-rollups', 'next-run', 60_000, now + 61_000)).toBe(true);
  });
});

describe('health', () => {
  const HOUR = 60 * 60 * 1000;
  const run = (status: ScheduledJobRun['status'], hoursAgo: number, error: string | null = null): ScheduledJobRun =>
    ({ businessId: BUSINESS_ID, jobName: 'x', status, startedAt: Timestamp.fromMillis(Date.now() - hoursAgo * HOUR), durationMs: 1, resultSummary: null, error }) as unknown as ScheduledJobRun;
  const daily = (runs: ScheduledJobRun[]) => classify(runs, 24 * HOUR, 10 * 60 * 1000, Date.now()).state;

  it('says exactly what the records say', () => {
    expect(daily([])).toBe('never_run');
    expect(daily([run('succeeded', 3)])).toBe('ok');
    expect(daily([run('failed', 3, 'boom'), run('succeeded', 27)])).toBe('failing');
    expect(daily([run('partial', 3)])).toBe('failing');
    expect(daily([run('succeeded', 50)])).toBe('overdue');
    expect(daily([run('running', 0.01)])).toBe('running');
    expect(daily([run('running', 2), run('succeeded', 26)])).toBe('abandoned');
    expect(daily([run('skipped', 1), run('succeeded', 3)])).toBe('ok');
  });

  it('a frequent job that never ran, while the scheduler has been running other jobs, is overdue — not silently "never run"', async () => {
    // Fresh deployment: nothing has run anywhere yet — honestly "never run", not an alarm.
    expect((await scheduledJobService.health(BUSINESS_ID)).find((job) => job.jobName === 'vending-fast-recovery')?.state).toBe('never_run');
    // A day later the daily jobs are running, but the 5-minute recovery sweep was never wired up.
    await adminFirestore.collection('scheduledJobRuns').add({ businessId: BUSINESS_ID, jobName: 'reconcile-vending-transactions', status: 'succeeded', startedAt: Timestamp.fromMillis(Date.now() - 2 * HOUR), finishedAt: Timestamp.fromMillis(Date.now() - 2 * HOUR), durationMs: 5, resultSummary: {}, errors: [], error: null });
    const health = await scheduledJobService.health(BUSINESS_ID);
    const fast = health.find((job) => job.jobName === 'vending-fast-recovery');
    expect(fast).toMatchObject({ state: 'overdue', lastError: expect.stringMatching(/never run/) });
    // Daily jobs that simply haven't had their first day yet are not accused.
    expect(health.find((job) => job.jobName === 'rebuild-vending-rollups')?.state).toBe('never_run');
    await alertService.evaluateAndSync(BUSINESS_ID);
    const alerts = await adminFirestore.collection('alerts').where('businessId', '==', BUSINESS_ID).where('dedupeKey', '==', 'job_failure:vending-fast-recovery').get();
    expect(alerts.size).toBe(1);
  });

  it('a daily job that never ran, while other jobs have run for days, is overdue — it was never scheduled', async () => {
    await adminFirestore.collection('scheduledJobRuns').add({ businessId: BUSINESS_ID, jobName: 'reconcile-vending-transactions', status: 'succeeded', startedAt: Timestamp.fromMillis(Date.now() - 3 * 24 * HOUR), finishedAt: Timestamp.fromMillis(Date.now() - 3 * 24 * HOUR), durationMs: 5, resultSummary: {}, errors: [], error: null });
    await adminFirestore.collection('scheduledJobRuns').add({ businessId: BUSINESS_ID, jobName: 'reconcile-vending-transactions', status: 'succeeded', startedAt: Timestamp.fromMillis(Date.now() - 2 * HOUR), finishedAt: Timestamp.fromMillis(Date.now() - 2 * HOUR), durationMs: 5, resultSummary: {}, errors: [], error: null });
    const health = await scheduledJobService.health(BUSINESS_ID);
    expect(health.find((job) => job.jobName === 'rebuild-vending-rollups')).toMatchObject({ state: 'overdue', lastError: expect.stringMatching(/never run/) });
    expect(health.find((job) => job.jobName === 'reconcile-vending-transactions')?.state).toBe('ok');
  });

  it('a failed job raises one job_failure alert, cleared by the next good run', async () => {
    await scheduledJobService.run(BUSINESS_ID, 'reconcile-stk-payments', async (job) => {
      await job.step('reconcile', async () => { throw new Error('daraja down'); });
      return {};
    });
    await alertService.evaluateAndSync(BUSINESS_ID);
    await alertService.evaluateAndSync(BUSINESS_ID);
    const open = async () => (await adminFirestore.collection('alerts').where('businessId', '==', BUSINESS_ID).where('type', '==', 'job_failure').get()).docs.map((doc) => doc.data());
    const alerts = await open();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ status: 'open', severity: 'warning', dedupeKey: 'job_failure:reconcile-stk-payments' });
    expect(alerts[0].detail).toContain('daraja down');

    await scheduledJobService.run(BUSINESS_ID, 'reconcile-stk-payments', async () => ({}));
    await alertService.evaluateAndSync(BUSINESS_ID);
    expect((await open()).map((alert) => alert.status)).toEqual(['resolved']);
  });
});
