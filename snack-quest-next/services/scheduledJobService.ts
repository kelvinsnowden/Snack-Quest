import 'server-only';

import { randomUUID } from 'node:crypto';
import { logger } from '@/lib/observability/logger';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';
import type { ScheduledJobRun, ScheduledJobRunStatus } from '@/types';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Every scheduled job, how often it is expected to run, and how long one
 * run may hold the job's lease. The schedule is where the trigger lives
 * (`vercel.json`, or the GitHub workflow for the 5-minute tier); this
 * table is what "overdue" is measured against.
 */
export const SCHEDULED_JOBS = {
  'vending-fast-recovery': { everyMs: 5 * 60 * 1000, leaseMs: 4 * 60 * 1000, trigger: '.github/workflows/vending-fast-recovery.yml (every 5 min)' },
  'reconcile-vending-transactions': { everyMs: 24 * HOUR_MS, leaseMs: 10 * 60 * 1000, trigger: 'vercel.json (daily)' },
  'reconcile-vending-commands': { everyMs: 24 * HOUR_MS, leaseMs: 10 * 60 * 1000, trigger: 'vercel.json (daily)' },
  'reconcile-stk-payments': { everyMs: 24 * HOUR_MS, leaseMs: 10 * 60 * 1000, trigger: 'vercel.json (daily)' },
  'reconcile-stuck-withdrawals': { everyMs: 24 * HOUR_MS, leaseMs: 10 * 60 * 1000, trigger: 'vercel.json (daily)' },
  'retry-notifications': { everyMs: 24 * HOUR_MS, leaseMs: 10 * 60 * 1000, trigger: 'vercel.json (daily)' },
  'rebuild-analytics-rollups': { everyMs: 24 * HOUR_MS, leaseMs: 10 * 60 * 1000, trigger: 'vercel.json (daily)' },
  'rebuild-vending-rollups': { everyMs: 24 * HOUR_MS, leaseMs: 10 * 60 * 1000, trigger: 'vercel.json (daily)' },
  'reconcile-subscription-arrears': { everyMs: 24 * HOUR_MS, leaseMs: 10 * 60 * 1000, trigger: 'vercel.json (daily)' },
  'generate-recommendations': { everyMs: 24 * HOUR_MS, leaseMs: 10 * 60 * 1000, trigger: 'vercel.json (daily), or "Generate now" on the Recommendations page' },
} as const;

export type ScheduledJobName = keyof typeof SCHEDULED_JOBS;

export interface JobContext {
  /**
   * Runs one isolated step. A step that throws is recorded and the job
   * carries on with the next; its result is `null`. Steps must be
   * idempotent (every sweep here is: compare-and-set transitions, claim-
   * before-act), because a failed run is simply run again.
   */
  step<T>(name: string, fn: () => Promise<T>): Promise<T | null>;
  /** Records an error for one item inside a step that otherwise carried on. */
  itemError(step: string, error: unknown): void;
}

export interface JobOutcome {
  runId: string | null;
  status: Exclude<ScheduledJobRunStatus, 'running'>;
  summary: Record<string, unknown>;
  errors: { step: string; message: string }[];
  durationMs: number;
}

export type JobHealthState = 'ok' | 'failing' | 'overdue' | 'abandoned' | 'running' | 'never_run';

export interface JobHealth {
  jobName: string;
  state: JobHealthState;
  expectedEveryMs: number;
  lastRunAt: string | null;
  lastStatus: ScheduledJobRunStatus | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  trigger: string;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);

class ScheduledJobService {
  /**
   * Runs a job the one way every cron does:
   *
   * 1. take the job's lease — a run that overlaps a live one is skipped
   *    (recorded as `skipped`); the lease expires on its own, so a killed
   *    run never blocks the next;
   * 2. write the `running` record — before any work;
   * 3. run the body; each `step` is isolated;
   * 4. finish the record with status, per-step errors, the summary and
   *    the duration; release the lease.
   *
   * Failed, partial, abandoned and overdue runs become `job_failure`
   * alerts through `alertService` (condition alerts: one per job,
   * auto-resolving on the next good run).
   */
  async run(
    businessId: string,
    jobName: ScheduledJobName,
    body: (job: JobContext) => Promise<Record<string, unknown>>,
  ): Promise<JobOutcome> {
    const startedAt = Date.now();
    const holder = randomUUID();
    const { leaseMs } = SCHEDULED_JOBS[jobName];
    if (!(await scheduledJobRunRepository.acquireLease(businessId, jobName, holder, leaseMs))) {
      await scheduledJobRunRepository.record({ businessId, jobName, status: 'skipped', durationMs: 0, resultSummary: null, error: 'another run of this job is in progress', errors: [] });
      logger.info('scheduled job skipped: another run holds the lease', { businessId, jobName });
      return { runId: null, status: 'skipped', summary: {}, errors: [], durationMs: 0 };
    }
    const runId = await scheduledJobRunRepository.start(businessId, jobName);
    const errors: { step: string; message: string }[] = [];
    let steps = 0;
    let failedSteps = 0;
    const job: JobContext = {
      step: async (name, fn) => {
        steps += 1;
        try {
          return await fn();
        } catch (error) {
          failedSteps += 1;
          errors.push({ step: name, message: messageOf(error) });
          logger.error('scheduled job step failed', { businessId, jobName, step: name, error });
          return null;
        }
      },
      itemError: (step, error) => {
        errors.push({ step, message: messageOf(error) });
      },
    };
    let summary: Record<string, unknown> = {};
    let bodyFailed = false;
    try {
      summary = await body(job);
    } catch (error) {
      bodyFailed = true;
      errors.push({ step: 'job', message: messageOf(error) });
      logger.error('scheduled job failed', { businessId, jobName, error });
    }
    const status: JobOutcome['status'] = bodyFailed || (steps > 0 && failedSteps === steps) ? 'failed' : errors.length > 0 ? 'partial' : 'succeeded';
    const durationMs = Date.now() - startedAt;
    try {
      await scheduledJobRunRepository.finish(runId, { status, durationMs, resultSummary: summary, error: errors[0]?.message ?? null, errors: errors.slice(0, 50) });
    } finally {
      await scheduledJobRunRepository.releaseLease(businessId, jobName, holder).catch((error: unknown) => logger.warn('could not release job lease', { jobName, error }));
    }
    logger.info('scheduled job finished', { businessId, jobName, status, durationMs, errors: errors.length, summary });
    return { runId, status, summary, errors, durationMs };
  }

  /** The response a cron route returns: 200 when clean or skipped, 500 when anything failed — so the scheduler's own history shows it too. */
  toResponse(outcome: JobOutcome): Response {
    const ok = outcome.status === 'succeeded' || outcome.status === 'skipped';
    return Response.json(
      { ok, status: outcome.status, runId: outcome.runId, durationMs: outcome.durationMs, ...outcome.summary, errors: outcome.errors.length ? outcome.errors : undefined },
      { status: ok ? 200 : 500 },
    );
  }

  /**
   * Per-job health from the run records — nothing invented: a job with no
   * runs says `never_run`. One inference, from the records themselves: a
   * job that has never run while *other* jobs' records show the scheduler
   * has been running for longer than that job's overdue window is
   * `overdue`, not "never run" — it was never wired up (e.g. the
   * fast-recovery workflow's secrets are missing, or a daily cron is
   * missing from `vercel.json`).
   */
  async health(businessId: string, now = Date.now()): Promise<JobHealth[]> {
    const perJob = await Promise.all(
      (Object.keys(SCHEDULED_JOBS) as ScheduledJobName[]).map(async (jobName) => {
        const { everyMs, leaseMs, trigger } = SCHEDULED_JOBS[jobName];
        const runs = (await scheduledJobRunRepository.listRecentForJob(businessId, jobName, 20)).map(({ data }) => data);
        return { health: { jobName, expectedEveryMs: everyMs, trigger, ...classify(runs, everyMs, leaseMs, now) }, runs };
      }),
    );
    const startedTimes = perJob.flatMap(({ runs }) => runs.map((run) => run.startedAt?.toMillis()).filter((at): at is number => typeof at === 'number'));
    const schedulerSince = startedTimes.length > 0 ? Math.min(...startedTimes) : null;
    return perJob.map(({ health }) => {
      const everyMs = health.expectedEveryMs;
      if (health.state === 'never_run' && schedulerSince !== null && now - schedulerSince > everyMs * 2 + Math.min(everyMs, 60 * 60 * 1000)) {
        return { ...health, state: 'overdue' as const, lastError: `never run, although other scheduled jobs have been running since ${new Date(schedulerSince).toISOString()} — check its trigger (${health.trigger})` };
      }
      return health;
    });
  }
}

/** Newest-first runs → the job's state. Overdue allows one missed schedule plus slack for scheduler delay. */
export function classify(runs: ScheduledJobRun[], everyMs: number, leaseMs: number, now: number): Omit<JobHealth, 'jobName' | 'expectedEveryMs' | 'trigger'> {
  const started = runs.filter((run) => run.status !== 'skipped' && run.startedAt);
  const last = started[0];
  const lastSuccess = started.find((run) => run.status === 'succeeded');
  const iso = (run: ScheduledJobRun | undefined) => (run?.startedAt ? run.startedAt.toDate().toISOString() : null);
  const base = { lastRunAt: iso(last), lastStatus: last?.status ?? null, lastSuccessAt: iso(lastSuccess), lastError: last?.error ?? null };
  if (!last) return { state: 'never_run', ...base };
  const lastAt = last.startedAt.toMillis();
  if (last.status === 'running') {
    return { state: now - lastAt > leaseMs * 2 ? 'abandoned' : 'running', ...base };
  }
  if (last.status === 'failed' || last.status === 'partial') return { state: 'failing', ...base };
  const overdueAfter = everyMs * 2 + Math.min(everyMs, 60 * 60 * 1000);
  if (now - lastAt > overdueAfter) return { state: 'overdue', ...base };
  return { state: 'ok', ...base };
}

export const scheduledJobService = new ScheduledJobService();
