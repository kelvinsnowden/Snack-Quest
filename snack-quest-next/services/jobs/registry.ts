import 'server-only';

import type { JobContext, ScheduledJobName } from '@/services/scheduledJobService';

/**
 * The work each scheduled job does, the same whether its cron fires or
 * someone presses "Run now" on Operations. `actorId` is who asked: the
 * job's own `system:` id for a cron run, the staff member's uid for a
 * manual one. Loaded lazily so a cron route only pulls in its own job.
 */
export type JobBody = (businessId: string, job: JobContext, actorId: string) => Promise<Record<string, unknown>>;

const LOADERS: Record<ScheduledJobName, () => Promise<JobBody>> = {
  'vending-fast-recovery': async () => (await import('./vendingFastRecovery')).vendingFastRecovery,
  'reconcile-vending-transactions': async () => (await import('./reconcileVendingTransactions')).reconcileVendingTransactions,
  'reconcile-vending-commands': async () => (await import('./reconcileVendingCommands')).reconcileVendingCommands,
  'reconcile-stk-payments': async () => (await import('./reconcileStkPayments')).reconcileStkPayments,
  'reconcile-stuck-withdrawals': async () => (await import('./reconcileStuckWithdrawals')).reconcileStuckWithdrawals,
  'retry-notifications': async () => (await import('./retryNotifications')).retryNotifications,
  'rebuild-analytics-rollups': async () => (await import('./rebuildAnalyticsRollups')).rebuildAnalyticsRollups,
  'rebuild-vending-rollups': async () => (await import('./rebuildVendingRollups')).rebuildVendingRollups,
  'generate-recommendations': async () => (await import('./generateRecommendations')).generateRecommendations,
};

export function loadJobBody(jobName: ScheduledJobName): Promise<JobBody> {
  return LOADERS[jobName]();
}
