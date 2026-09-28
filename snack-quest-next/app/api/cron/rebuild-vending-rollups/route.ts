import { vendingRollupService } from '@/services/vendingRollupService';
import { isAuthorizedCronRequest } from '@/lib/auth/cronAuth';
import { machineRepository } from '@/repositories/machineRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { getCurrentBusinessId } from '@/lib/business/currentBusinessId';
import { scheduledJobService } from '@/services/scheduledJobService';
import { dateKey } from '@/lib/analytics/dateKey';

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
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const businessId = getCurrentBusinessId();
  const outcome = await scheduledJobService.run(businessId, 'rebuild-vending-rollups', async (job) => {
    const startDate = dateKey(new Date(Date.now() - 3 * DAY_MS));
    const endDate = dateKey(new Date());
    const { machines } = await machineRepository.listByBusiness(businessId, { limit: 10000 });
    const partners = await partnerRepository.listByBusiness(businessId);

    // One machine's or partner's rollup failing must not leave everyone else's stale.
    let machineDays = 0;
    await job.step('machine rollups', async () => {
      for (const { id: machineId } of machines) {
        try {
          machineDays += (await vendingRollupService.rebuildMachineDayRange(businessId, machineId, startDate, endDate)).days;
        } catch (error) {
          job.itemError(`machine rollup ${machineId}`, error);
        }
      }
    });
    let partnerDays = 0;
    await job.step('partner rollups', async () => {
      for (const { id: partnerId } of partners) {
        try {
          partnerDays += (await vendingRollupService.rebuildPartnerDayRange(businessId, partnerId, startDate, endDate)).days;
        } catch (error) {
          job.itemError(`partner rollup ${partnerId}`, error);
        }
      }
    });
    const network = await job.step('network rollups', () => vendingRollupService.rebuildNetworkDayRange(businessId, startDate, endDate));
    return { machineCount: machines.length, machineDays, partnerCount: partners.length, partnerDays, networkDays: network?.days ?? null };
  });
  return scheduledJobService.toResponse(outcome);
}
