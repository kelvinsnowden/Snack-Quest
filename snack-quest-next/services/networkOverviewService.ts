import 'server-only';

import { machineRepository } from '@/repositories/machineRepository';
import { locationRepository } from '@/repositories/locationRepository';
import { partnerRepository } from '@/repositories/partnerRepository';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { withdrawalRepository } from '@/repositories/withdrawalRepository';
import { networkIntelligenceService } from '@/services/networkIntelligenceService';
import { alertService } from '@/services/alertService';
import { deriveConnectivityStatus } from '@/lib/vending/connectivity';
import type { Alert } from '@/types';

export interface OperationsNetworkOverview {
  machineCount: number;
  activeMachineCount: number;
  locationCount: number;
  ownerCount: number;
  onlineMachineCount: number;
  offlineMachineCount: number;
  revenueKes30d: number;
  transactionCount30d: number;
  inventoryDeployedValueKes: number;
  stockoutRiskCount: number;
  restockQueueCount: number;
  faultCount: number;
  subscriptionIssueCount: number;
  pendingWithdrawalCount: number;
  reconciliationIssueCount: number;
}

/**
 * § PART 3 — OPERATIONS COMMAND CENTER, NETWORK OVERVIEW. Every one of
 * the brief's 15 numbers, each read from wherever this codebase
 * already computes it rather than a second, parallel aggregation:
 * revenue/transactions/inventory value from `networkIntelligenceService`'s
 * own rollup-composed overview (§ NETWORK INTELLIGENCE, unchanged by
 * this file); fault/stockout/subscription/reconciliation counts from
 * `alertService`'s own sweep, which is exactly what the Alert Center
 * page shows — this page and that one can never disagree about how
 * many faults are open, because they read the same open alerts.
 */
class NetworkOverviewService {
  /**
   * `openAlerts` may be passed in already-fetched (post-sweep) by a
   * caller that also needs the same alert list for its own purposes
   * (e.g. the fleet table's per-machine fault/stockout icons) — so
   * the two reads can never race against two independent sweeps and
   * disagree about which alerts are currently open. Omit it and this
   * runs its own sweep + fetch, unchanged, for any standalone caller.
   */
  async getOverview(businessId: string, openAlerts?: { id: string; data: Alert }[]): Promise<OperationsNetworkOverview> {
    if (!openAlerts) {
      await alertService.evaluateAndSync(businessId);
    }

    const [machines, locations, partners, resolvedOpenAlerts, openRestockTasks, pendingWithdrawals, intelligenceOverview] = await Promise.all([
      machineRepository.listAllStatuses(businessId),
      locationRepository.listByBusiness(businessId),
      partnerRepository.listByBusiness(businessId),
      openAlerts ? Promise.resolve(openAlerts) : alertService.listOpen(businessId),
      restockTaskRepository.listOpenByBusiness(businessId),
      withdrawalRepository.listByBusiness(businessId, { status: 'pending', limit: 500 }),
      networkIntelligenceService.getNetworkOverview(businessId, 30),
    ]);

    const onlineMachineCount = machines.filter((m) => deriveConnectivityStatus(m.lastSeenAt) === 'online').length;
    const offlineMachineCount = machines.filter((m) => deriveConnectivityStatus(m.lastSeenAt) === 'offline').length;
    const activeMachineCount = machines.filter((m) => m.status === 'active').length;

    const countAlerts = (...types: string[]) => resolvedOpenAlerts.filter((a) => types.includes(a.data.type)).length;

    return {
      machineCount: machines.length,
      activeMachineCount,
      locationCount: locations.length,
      ownerCount: partners.length,
      onlineMachineCount,
      offlineMachineCount,
      revenueKes30d: intelligenceOverview.revenueKes,
      transactionCount30d: intelligenceOverview.transactionCount,
      inventoryDeployedValueKes: intelligenceOverview.inventoryValueKes,
      stockoutRiskCount: countAlerts('stockout', 'stockout_risk'),
      restockQueueCount: openRestockTasks.length,
      faultCount: countAlerts('machine_fault'),
      subscriptionIssueCount: countAlerts('subscription_issue'),
      pendingWithdrawalCount: pendingWithdrawals.withdrawals.filter((w) => w.data.ownerType === 'partner').length,
      reconciliationIssueCount: countAlerts('payment_reconciliation_issue'),
    };
  }
}

export const networkOverviewService = new NetworkOverviewService();
export { NetworkOverviewService };
