import 'server-only';

import { vendingRollupService } from '@/services/vendingRollupService';
import { machineRepository } from '@/repositories/machineRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { machineFleetSummaryService } from '@/services/machineFleetSummaryService';
import { dateKey } from '@/lib/analytics/dateKey';
import type { JobContext } from '@/services/scheduledJobService';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rebuilds machine, owner and network daily rollups for `[startDate,
 * endDate]` (UTC day keys; today is always skipped by the rollup
 * service), then refreshes every machine's fleet summary. The nightly
 * run covers the last three days; a person can ask for a longer range
 * after fixing data (see `/api/vending/rollups/rebuild`).
 */
export async function rebuildVendingRollupRange(businessId: string, job: JobContext, range: { startDate: string; endDate: string }): Promise<Record<string, unknown>> {
  const { startDate, endDate } = range;
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
  // After the rollups, so each machine's 7-day revenue on the fleet page includes yesterday.
  const fleet = await job.step('fleet summaries', () => machineFleetSummaryService.refreshAll(businessId));
  (fleet?.itemErrors ?? []).forEach(({ itemId, message }) => job.itemError(`fleet summary ${itemId}`, new Error(message)));
  return { startDate, endDate, machineCount: machines.length, machineDays, partnerCount: partners.length, partnerDays, networkDays: network?.days ?? null, fleetSummaries: fleet?.refreshed ?? null };
}

/** The nightly run: the last three days. */
export function rebuildVendingRollups(businessId: string, job: JobContext): Promise<Record<string, unknown>> {
  return rebuildVendingRollupRange(businessId, job, { startDate: dateKey(new Date(Date.now() - 3 * DAY_MS)), endDate: dateKey(new Date()) });
}
