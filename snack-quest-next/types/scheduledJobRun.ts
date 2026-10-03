import type { Timestamp } from 'firebase/firestore';

/**
 * - `running`: written when the run starts, before any work — so a run
 *   that crashes or is killed by the platform still leaves a trace (it
 *   stays `running`, and is reported as abandoned once its lease is long
 *   past).
 * - `succeeded`: every step completed.
 * - `partial`: some steps failed, the rest completed (each step is
 *   isolated; one failing never stops the others).
 * - `failed`: nothing completed.
 * - `skipped`: another run of the same job held the lease.
 */
export type ScheduledJobRunStatus = 'running' | 'succeeded' | 'partial' | 'failed' | 'skipped';

/**
 * `scheduledJobRuns/{runId}` — a durable record of every scheduled
 * job invocation (§ Phase 5: Observability). Vercel Cron (the
 * platform's only real scheduled-job mechanism, see
 * `app/api/cron/retry-notifications/route.ts`'s own doc comment) has
 * no built-in run history a business owner can see — before this,
 * "did the retry sweep even run today" was answerable only by reading
 * Vercel's own dashboard logs, which no non-developer operator has
 * access to. Written by `scheduledJobService.run` on every invocation,
 * so the Operations dashboard (§ Admin: Operations) can show real run
 * history instead of inferring health from its side effects.
 */
export interface ScheduledJobRun {
  businessId: string;
  jobName: string;
  status: ScheduledJobRunStatus;
  startedAt: Timestamp;
  finishedAt?: Timestamp | null;
  durationMs: number;
  /** e.g. `{ attempted: 3 }` for the notification retry sweep — job-specific, kept loose rather than typed per job. */
  resultSummary: Record<string, unknown> | null;
  /** First error message (or the reason a run was skipped); every error is in `errors`. */
  error: string | null;
  /** One entry per failed step or item. */
  errors?: { step: string; message: string }[];
}
