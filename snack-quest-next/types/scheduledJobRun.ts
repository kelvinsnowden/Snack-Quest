import type { Timestamp } from 'firebase/firestore';

export type ScheduledJobRunStatus = 'succeeded' | 'failed';

/**
 * `scheduledJobRuns/{runId}` — a durable record of every scheduled
 * job invocation (§ Phase 5: Observability). Vercel Cron (the
 * platform's only real scheduled-job mechanism, see
 * `app/api/cron/retry-notifications/route.ts`'s own doc comment) has
 * no built-in run history a business owner can see — before this,
 * "did the retry sweep even run today" was answerable only by reading
 * Vercel's own dashboard logs, which no non-developer operator has
 * access to. Written on every invocation, success or failure, so the
 * Operations dashboard (§ Admin: Operations) can show real run
 * history instead of inferring health from its side effects.
 */
export interface ScheduledJobRun {
  businessId: string;
  jobName: string;
  status: ScheduledJobRunStatus;
  startedAt: Timestamp;
  durationMs: number;
  /** e.g. `{ attempted: 3 }` for the notification retry sweep — job-specific, kept loose rather than typed per job. */
  resultSummary: Record<string, unknown> | null;
  error: string | null;
}
