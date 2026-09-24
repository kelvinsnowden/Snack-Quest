import 'server-only';

import { machineService, PartnerDoesNotOwnMachineError } from '@/services/machineService';
import { partnerService } from '@/services/partnerService';
import { locationService } from '@/services/locationService';
import { ownerIntelligenceService, type OwnerMachineSummary } from '@/services/ownerIntelligenceService';
import { machineSettlementService } from '@/services/machineSettlementService';
import { machineSubscriptionService } from '@/services/machineSubscriptionService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { restockTaskRepository } from '@/repositories/restockTaskRepository';
import { withdrawalService } from '@/services/withdrawalService';
import { deriveConnectivityStatus } from '@/lib/vending/connectivity';
import type { Location, Machine, MachineSubscription } from '@/types';

export { PartnerDoesNotOwnMachineError };

/** Every window § MACHINE DETAIL — Performance names ("Today / 7 days / 30 days / 90 days"). */
export const OWNER_PERFORMANCE_WINDOWS_DAYS = [1, 7, 30, 90] as const;

export interface OwnerMachineCard {
  machineId: string;
  machineCode: string;
  status: Machine['status'];
  connectivity: ReturnType<typeof deriveConnectivityStatus>;
  locationName: string | null;
  revenueKes: number;
  unitsSold: number;
  stockHealth: OwnerMachineSummary['stockHealth'];
  subscriptionStatus: MachineSubscription['status'] | null;
}

export interface OwnerDashboard {
  partner: { id: string; name: string; contactEmail: string | null };
  wallet: { earnedKes: number; availableKes: number; pendingKes: number; withdrawnKes: number };
  machines: OwnerMachineCard[];
}

const PENDING_WITHDRAWAL_STATUSES = new Set(['pending', 'submitting', 'approved']);

/**
 * Sums this partner's own withdrawals into `pendingKes`/`withdrawnKes`
 * (§ OWNER WALLET). Bounded pagination rather than an unbounded
 * scan — a lifetime of one partner's own withdrawal requests is never
 * remotely transaction-volume-sized, so a firm page cap here is a
 * safety bound, not a real limit anyone will hit.
 */
async function sumWithdrawals(businessId: string, partnerId: string): Promise<{ pendingKes: number; withdrawnKes: number }> {
  let pendingKes = 0;
  let withdrawnKes = 0;
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const { withdrawals, nextCursor } = await withdrawalService.listWithdrawalsForOwner(businessId, partnerId, { cursor });
    for (const { data } of withdrawals) {
      if (data.status === 'paid') {
        withdrawnKes += data.amountKes;
      } else if (PENDING_WITHDRAWAL_STATUSES.has(data.status)) {
        pendingKes += data.amountKes;
      }
    }
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return { pendingKes, withdrawnKes };
}

export interface OwnerMachineDetail {
  machineId: string;
  machineCode: string;
  status: Machine['status'];
  connectivity: ReturnType<typeof deriveConnectivityStatus>;
  lastHeartbeatAt: string | null;
  lastSaleAt: string | null;
  lastRestock: { taskId: string; status: string; createdAt: string } | null;
  location: { id: string; name: string; city: string; area: string | null } | null;
  performanceByWindow: Record<(typeof OWNER_PERFORMANCE_WINDOWS_DAYS)[number], OwnerMachineSummary>;
  /** Distributable profit summed from this machine's own finalized/paid settlements — machine-attributable, unlike the pooled wallet balance (§ OWNER WALLET: never pretend a per-machine split of a pooled balance). */
  lifetimeDistributableProfitKes: number;
}

/**
 * Everything the Owner Portal itself needs, composed entirely from
 * services Phases 1–3 already built (§ PART 2 — OWNER PORTAL) — no
 * new financial or intelligence computation lives here, only
 * assembly, and every read still goes through
 * `machineService.assertPartnerOwnsMachine` (via `ownerIntelligenceService`
 * or directly) so a partner can never reach another partner's
 * machine by trying a different id.
 */
class OwnerPortalService {
  async getDashboard(businessId: string, partnerId: string): Promise<OwnerDashboard> {
    const partner = await partnerService.findById(businessId, partnerId);
    if (!partner) {
      throw new PartnerDoesNotOwnMachineError(partnerId, '(no machine)');
    }
    const machines = await partnerService.listMachines(businessId, partnerId);
    const [locations, subscriptions] = await Promise.all([
      locationService.listByBusiness(businessId),
      machineSubscriptionService.listByPartner(businessId, partnerId),
    ]);
    const locationById = new Map<string, Location>(locations.map(({ id, data }) => [id, data]));
    const subscriptionByMachine = new Map<string, MachineSubscription>(subscriptions.map(({ data }) => [data.machineId, data]));

    const cards: OwnerMachineCard[] = await Promise.all(
      machines.map(async ({ id: machineId, data: machine }) => {
        const summary = await ownerIntelligenceService.getMachineOwnerSummary(businessId, partnerId, machineId, 30);
        return {
          machineId,
          machineCode: machine.machineCode,
          status: machine.status,
          connectivity: deriveConnectivityStatus(machine.lastSeenAt),
          locationName: machine.locationId ? locationById.get(machine.locationId)?.name ?? null : null,
          revenueKes: summary.revenueKes,
          unitsSold: summary.unitsSold,
          stockHealth: summary.stockHealth,
          subscriptionStatus: subscriptionByMachine.get(machineId)?.status ?? null,
        };
      }),
    );

    // `availableCashKes`/`lifetimeEarnedKes` are already the running
    // totals § OWNER WALLET requires ("never present gross central
    // Snack Quest cash as owner balance") — `pendingKes`/`withdrawnKes`
    // are the one thing not already cached anywhere, so they're summed
    // from the partner's own withdrawal history.
    const { pendingKes, withdrawnKes } = await sumWithdrawals(businessId, partnerId);

    return {
      partner: { id: partnerId, name: partner.name, contactEmail: partner.contactEmail },
      wallet: { earnedKes: partner.lifetimeEarnedKes, availableKes: partner.availableCashKes, pendingKes, withdrawnKes },
      machines: cards,
    };
  }

  async getMachineDetail(businessId: string, partnerId: string, machineId: string): Promise<OwnerMachineDetail> {
    const machine = await machineService.assertPartnerOwnsMachine(businessId, partnerId, machineId);

    const [performanceEntries, lastSalePage, restockRows, settlements, location] = await Promise.all([
      Promise.all(OWNER_PERFORMANCE_WINDOWS_DAYS.map((days) => ownerIntelligenceService.getMachineOwnerSummary(businessId, partnerId, machineId, days))),
      machineTransactionRepository.listByBusiness(businessId, { machineId, status: 'dispensed', limit: 1 }),
      restockTaskRepository.listByMachine(businessId, machineId, 1),
      machineSettlementService.listByMachine(businessId, machineId),
      machine.locationId ? locationService.findById(businessId, machine.locationId) : Promise.resolve(null),
    ]);

    const performanceByWindow = Object.fromEntries(
      OWNER_PERFORMANCE_WINDOWS_DAYS.map((days, index) => [days, performanceEntries[index]]),
    ) as Record<(typeof OWNER_PERFORMANCE_WINDOWS_DAYS)[number], OwnerMachineSummary>;

    const lastSale = lastSalePage.transactions[0] ?? null;
    const lastRestockRow = restockRows[0] ?? null;
    const lifetimeDistributableProfitKes = settlements
      .filter(({ data }) => data.status === 'finalized' || data.status === 'paid')
      .reduce((sum, { data }) => sum + data.distributableOwnerKes, 0);

    return {
      machineId,
      machineCode: machine.machineCode,
      status: machine.status,
      connectivity: deriveConnectivityStatus(machine.lastSeenAt),
      lastHeartbeatAt: machine.lastSeenAt ? machine.lastSeenAt.toDate().toISOString() : null,
      lastSaleAt: lastSale ? lastSale.data.dispensedAt?.toDate().toISOString() ?? null : null,
      lastRestock: lastRestockRow ? { taskId: lastRestockRow.id, status: lastRestockRow.data.status, createdAt: lastRestockRow.data.createdAt.toDate().toISOString() } : null,
      location: location ? { id: machine.locationId as string, name: location.name, city: location.city, area: location.area } : null,
      performanceByWindow,
      lifetimeDistributableProfitKes,
    };
  }
}

export const ownerPortalService = new OwnerPortalService();
export { OwnerPortalService };
