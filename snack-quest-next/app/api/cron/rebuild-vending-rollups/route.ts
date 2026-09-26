import { vendingRollupService } from '@/services/vendingRollupService';
import { machineRepository } from '@/repositories/machineRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobRunRepository } from '@/repositories/scheduledJobRunRepository';
import { dateKey } from '@/lib/analytics/dateKey';

const JOB_NAME = 'rebuild-vending-rollups';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Keeps `machineDailySummary`, `partnerDailySummary` and
 * `networkDailySummary` current without a fleet, partner, or network
 * dashboard load paying for the rebuild (§ ANALYTICS, § NETWORK
 * INTELLIGENCE, mirrors `rebuild-analytics-rollups` exactly — see that
 * route and docs/ANALYTICS_ROLLUPS.md §3 for why this pairing of
 * "cron keeps it warm" with "a missing day self-heals on read"
 * — `vendingRollupService.computePartnerDay`/`computeNetworkDay` — is
 * the shape to keep, not a fresh one).
 *
 * The last three days are rebuilt for every machine, then for every
 * partner, same three-day margin `rebuild-analytics-rollups` uses for
 * traffic: a device can report late against a stale clock, and a
 * rebuild is idempotent, so recovering a day this job already handled
 * correctly costs a cheap read and changes nothing.
 *
 * Fans out per machine and per partner rather than one combined write —
 * this is the fleet's own version of the "no single fleet-wide
 * document" rule the brief and `docs/ANALYTICS_ROLLUPS.md` both state:
 * a fleet of N machines produces N small writes here, never one
 * document every machine's rebuild would contend on. Load-tested only
 * informally so far; `docs/FLEET_ARCHITECTURE_AUDIT.md` §7 already
 * flags synthetic load testing at 50/100/500 machines as not yet done,
 * and that gap applies to this job's own runtime just as much as to
 * the dashboards it feeds.
 */
export async function GET(request: Request): Promise<Response> {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const businessId = getCurrentBusinessId();
  const startedAtMs = Date.now();

  try {
    const startDate = dateKey(new Date(Date.now() - 3 * DAY_MS));
    const endDate = dateKey(new Date());

    const { machines } = await machineRepository.listByBusiness(businessId, { limit: 10000 });
    const partners = await partnerRepository.listByBusiness(businessId);

    let machineDays = 0;
    for (const { id: machineId } of machines) {
      const { days } = await vendingRollupService.rebuildMachineDayRange(businessId, machineId, startDate, endDate);
      machineDays += days;
    }

    let partnerDays = 0;
    for (const { id: partnerId } of partners) {
      const { days } = await vendingRollupService.rebuildPartnerDayRange(businessId, partnerId, startDate, endDate);
      partnerDays += days;
    }

    const { days: networkDays } = await vendingRollupService.rebuildNetworkDayRange(businessId, startDate, endDate);

    const result = { machineCount: machines.length, machineDays, partnerCount: partners.length, partnerDays, networkDays };
    await scheduledJobRunRepository.record({
      businessId,
      jobName: JOB_NAME,
      status: 'succeeded',
      durationMs: Date.now() - startedAtMs,
      resultSummary: result,
      error: null,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    await scheduledJobRunRepository.record({
      businessId,
      jobName: JOB_NAME,
      status: 'failed',
      durationMs: Date.now() - startedAtMs,
      resultSummary: null,
      error: error instanceof Error ? error.message : 'unknown error',
    });
    throw error;
  }
}
