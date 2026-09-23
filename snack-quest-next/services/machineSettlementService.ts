import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { machineSettlementRepository } from '@/repositories/machineSettlementRepository';
import { partnerMachineAgreementRepository } from '@/repositories/partnerMachineAgreementRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import type { MachineSettlement } from '@/types';

/**
 * Settlement foundation (§ CORE ENTITIES 9, § "do not invent
 * commercial terms"). `computeGrossForPeriod` is real arithmetic over
 * real transactions — every other figure on a settlement stays null
 * until an active `PartnerMachineAgreement` actually supplies the
 * term it depends on, per that type's own doc comment.
 *
 * Deliberately no `revenueSharePartnerPct` default, no `/2`, no
 * invented operating-cost percentage anywhere in this file. A
 * settlement created before an agreement exists is a real, storable
 * record of gross sales with every downstream figure honestly null —
 * not a number nobody agreed to.
 */
class MachineSettlementService {
  /** Sums `dispensed` transactions in the period — the one figure this codebase can compute without anyone's agreement. */
  async computeGrossForPeriod(businessId: string, machineId: string, periodStart: Date, periodEnd: Date): Promise<{ grossSalesKes: number; refundsKes: number; transactionCount: number }> {
    let grossSalesKes = 0;
    let refundsKes = 0;
    let transactionCount = 0;
    for await (const { data } of machineTransactionRepository.streamRange(businessId, {
      machineId,
      since: periodStart,
      until: periodEnd,
    })) {
      if (data.status === 'dispensed') {
        grossSalesKes += data.amountKes;
        transactionCount += 1;
      } else if (data.status === 'refunded') {
        refundsKes += data.amountKes;
      }
    }
    return { grossSalesKes, refundsKes, transactionCount };
  }

  async createDraft(input: { businessId: string; machineId: string; partnerId: string; periodStart: Date; periodEnd: Date; actor: string }): Promise<string> {
    const { grossSalesKes, refundsKes } = await this.computeGrossForPeriod(input.businessId, input.machineId, input.periodStart, input.periodEnd);
    const agreement = await partnerMachineAgreementRepository.findActiveForMachine(input.businessId, input.machineId);

    const revenueSharePartnerPct = agreement?.data.revenueSharePartnerPct ?? null;
    const netDistributableKes = revenueSharePartnerPct === null ? null : grossSalesKes - refundsKes;
    const partnerShareKes =
      revenueSharePartnerPct !== null && netDistributableKes !== null
        ? Math.round((netDistributableKes * revenueSharePartnerPct) / 100)
        : null;
    const businessShareKes =
      partnerShareKes !== null && netDistributableKes !== null ? netDistributableKes - partnerShareKes : null;

    return machineSettlementRepository.create({
      businessId: input.businessId,
      machineId: input.machineId,
      partnerId: input.partnerId,
      agreementId: agreement?.id ?? null,
      periodStart: Timestamp.fromDate(input.periodStart) as unknown as MachineSettlement['periodStart'],
      periodEnd: Timestamp.fromDate(input.periodEnd) as unknown as MachineSettlement['periodEnd'],
      status: 'draft',
      grossSalesKes,
      refundsKes,
      operatingCostsKes: null,
      adjustmentKes: 0,
      adjustmentReason: null,
      netDistributableKes,
      partnerShareKes,
      businessShareKes,
      createdBy: input.actor,
    });
  }
}

export const machineSettlementService = new MachineSettlementService();
