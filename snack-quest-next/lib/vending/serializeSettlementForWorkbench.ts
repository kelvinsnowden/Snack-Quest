import type { MachineSettlement } from '@/types';
import type { WorkbenchSettlement } from '@/components/admin/vending/SettlementWorkbench';

const iso = (value: { toDate(): Date } | null | undefined) => (value ? value.toDate().toISOString() : null);

/** A stored settlement in the shape the settlement screens show. */
export function toWorkbenchSettlement(id: string, data: MachineSettlement, machineCode: string): WorkbenchSettlement {
  return {
    id,
    machineId: data.machineId,
    machineCode,
    periodStart: iso(data.periodStart)!,
    periodEnd: iso(data.periodEnd)!,
    status: data.status,
    grossSalesKes: data.grossSalesKes,
    refundsKes: data.refundsKes,
    cogsKes: data.cogsKes,
    unpricedSaleCount: data.unpricedSaleCount,
    subscriptionChargedKes: data.subscriptionChargedKes,
    distributableOwnerKes: data.distributableOwnerKes,
    adjustmentKes: data.adjustmentKes,
    adjustmentReason: data.adjustmentReason,
    failedVendRefundsKes: data.failedVendRefundsKes ?? 0,
    outcomeConflictCount: data.outcomeConflictCount ?? 0,
    partnerShareKes: data.partnerShareKes,
    finalizedAt: iso(data.finalizedAt),
  };
}
