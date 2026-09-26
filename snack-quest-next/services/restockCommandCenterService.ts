import 'server-only';

import { machineRepository } from '@/repositories/machineRepository';
import { machineAssortmentIntelligenceService } from '@/services/machineAssortmentIntelligenceService';
import { computeRestockNeed, type RestockNeed } from '@/services/recommendationEngineService';

export interface RestockCommandCenterRow extends RestockNeed {
  machineId: string;
  machineCode: string;
  venueName: string | null;
}

/**
 * § PART 3 — RESTOCK COMMAND CENTER. A live, fleet-wide view of the
 * exact same "at risk" slots and recommended quantities
 * `recommendationEngineService.generateRestockRecommendations` would
 * write as `RESTOCK` recommendations — `computeRestockNeed` is the
 * one formula both paths share, so this table can never show a
 * number recommendation-generation would disagree with. Deliberately
 * a live read, not a listing of stored recommendations: a stored
 * recommendation only exists for a machine `generateRestockRecommendations`
 * has actually been run against recently, and this page's whole job
 * is fleet-wide triage, not "whichever machines happened to have that
 * job run."
 */
class RestockCommandCenterService {
  async getAtRiskSlots(businessId: string, windowDays = 14): Promise<RestockCommandCenterRow[]> {
    const machines = await machineRepository.listAllStatuses(businessId);
    const activeMachineIds = machines.filter((m) => m.status === 'active').map((m) => m.id);
    const fullMachines = await machineRepository.listAllForBusiness(businessId);
    const machineById = new Map(fullMachines.map(({ id, data }) => [id, data]));

    const perMachine = await Promise.all(
      activeMachineIds.map(async (machineId) => {
        const performance = await machineAssortmentIntelligenceService.getAssortmentPerformance(businessId, machineId, windowDays);
        const machine = machineById.get(machineId);
        const rows: RestockCommandCenterRow[] = [];
        for (const slot of performance.slots) {
          const need = computeRestockNeed(slot);
          if (!need) continue;
          rows.push({ ...need, machineId, machineCode: machine?.machineCode ?? machineId, venueName: machine?.venueName ?? null });
        }
        return rows;
      }),
    );

    return perMachine.flat().sort((a, b) => a.daysOfStockRemaining - b.daysOfStockRemaining);
  }
}

export const restockCommandCenterService = new RestockCommandCenterService();
export { RestockCommandCenterService };
