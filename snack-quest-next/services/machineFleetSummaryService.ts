import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { machineFleetSummaryRepository } from '@/repositories/machineFleetSummaryRepository';
import { machineDailySummaryRepository } from '@/repositories/machineDailySummaryRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { machineRepository } from '@/repositories/machineRepository';
import { trailingWindow } from '@/services/machineAssortmentIntelligenceService';
import { isCustomerSale, type MachineFleetSummary } from '@/types';

/** How old a summary may be before the fleet page refreshes it on view. */
export const FLEET_SUMMARY_MAX_AGE_MS = 15 * 60 * 1000;
/** A fleet page never refreshes more than this many summaries inline; the rest wait for the next view or the nightly run. */
const MAX_INLINE_REFRESH = 50;

/**
 * Keeps `machineFleetSummary` current: the figures the fleet table
 * shows for each machine, computed from the same sources the table used
 * to query live (daily rollups, slots, the last sale, restocks).
 */
class MachineFleetSummaryService {
  async refresh(businessId: string, machineId: string): Promise<MachineFleetSummary> {
    const { startDate, endDate } = trailingWindow(7);
    const [rollups, slots, recent, restockTasks] = await Promise.all([
      machineDailySummaryRepository.listRange(businessId, machineId, startDate, endDate),
      machineSlotRepository.listByMachine(businessId, machineId),
      machineTransactionRepository.listByBusiness(businessId, { machineId, status: 'dispensed', limit: 5 }),
      restockTaskRepository.listByMachine(businessId, machineId, 10),
    ]);
    let revenueKes7d = 0;
    for (const rollup of rollups.values()) revenueKes7d += rollup.grossSalesKes;
    const loaded = slots.filter((slot) => slot.enabled && slot.productId);
    const lastSale = recent.transactions.find(({ data }) => isCustomerSale(data)) ?? null;
    const lastReceived = restockTasks.find((task) => task.data.status === 'received') ?? null;
    const summary = {
      businessId,
      machineId,
      revenueKes7d,
      slotCount: loaded.length,
      sellableCount: loaded.filter((slot) => slot.currentQuantity > 0).length,
      pausedSlotCount: slots.filter((slot) => slot.quarantine).length,
      lastSaleAt: (lastSale ? (lastSale.data.dispensedAt ?? lastSale.data.createdAt) : null) as MachineFleetSummary['lastSaleAt'],
      lastRestockAt: (lastReceived ? lastReceived.data.updatedAt : null) as MachineFleetSummary['lastRestockAt'],
    };
    await machineFleetSummaryRepository.set(summary);
    return { ...summary, refreshedAt: Timestamp.now() as unknown as MachineFleetSummary['refreshedAt'] };
  }

  /**
   * Summaries for the machines on one fleet page, refreshing any that are
   * missing or older than `FLEET_SUMMARY_MAX_AGE_MS` (at most
   * `MAX_INLINE_REFRESH` per view, so a page load stays bounded).
   */
  async getForPage(businessId: string, machineIds: string[], now = Date.now()): Promise<Map<string, MachineFleetSummary>> {
    const stored = await machineFleetSummaryRepository.getMany(businessId, machineIds);
    const stale = machineIds.filter((id) => {
      const summary = stored.get(id);
      return !summary || !summary.refreshedAt || now - summary.refreshedAt.toMillis() > FLEET_SUMMARY_MAX_AGE_MS;
    });
    const refreshed = await Promise.all(stale.slice(0, MAX_INLINE_REFRESH).map((id) => this.refresh(businessId, id).catch(() => null)));
    for (const summary of refreshed) {
      if (summary) stored.set(summary.machineId, summary);
    }
    return stored;
  }

  /** Every machine's summary — the nightly run. One machine failing never stops the rest. */
  async refreshAll(businessId: string): Promise<{ refreshed: number; itemErrors: { itemId: string; message: string }[] }> {
    const machines = await machineRepository.listAllStatuses(businessId);
    let refreshed = 0;
    const itemErrors: { itemId: string; message: string }[] = [];
    for (const { id } of machines) {
      try {
        await this.refresh(businessId, id);
        refreshed += 1;
      } catch (error) {
        itemErrors.push({ itemId: id, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return { refreshed, itemErrors };
  }
}

export const machineFleetSummaryService = new MachineFleetSummaryService();
