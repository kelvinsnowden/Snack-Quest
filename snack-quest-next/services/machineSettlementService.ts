import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineSettlementRepository, IllegalSettlementTransitionError, MachineSettlementNotFoundError } from '@/repositories/machineSettlementRepository';
import { partnerMachineAgreementRepository } from '@/repositories/partnerMachineAgreementRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { machineInventoryMovementRepository } from '@/repositories/machineInventoryMovementRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { snackItemRepository } from '@/repositories/snackItemRepository';
import { machineSubscriptionRepository } from '@/repositories/machineSubscriptionRepository';
import { creditEarningsInTransaction } from '@/repositories/partnerRepository';
import type { MachineSettlement } from '@/types';

export { MachineSettlementNotFoundError, IllegalSettlementTransitionError };

/**
 * Settlement (§ CORE ENTITIES 9, § MACHINE ECONOMICS,
 * docs/MACHINE_COMMERCE.md §3). `computeGrossForPeriod` and the COGS/
 * subscription figures below are real arithmetic over real data;
 * `netDistributableKes`/`partnerShareKes`/`businessShareKes` (the
 * legacy revenue-share path) stay exactly as they were — null unless
 * an agreement actually supplies `revenueSharePartnerPct` — per that
 * type's own doc comment. `distributableOwnerKes` is the figure this
 * business actually settles on today; see `docs/MACHINE_COMMERCE.md`
 * §1 for why the two coexist rather than one replacing the other.
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

  /**
   * Sums the cost of every `sale` movement in the period
   * (§ MACHINE ECONOMICS, docs/MACHINE_COMMERCE.md §4). Cost is
   * resolved through the slot a sale happened on, at its *current*
   * configuration — a known approximation, honestly stated: a slot
   * that was reconfigured to a different product mid-period would
   * misattribute cost for sales before the reconfiguration. Building
   * a fully time-accurate resolution (a slot-configuration history)
   * is real, future work, not fabricated precision here. Every sale
   * whose cost can't be resolved (a `package`-catalogue slot, which
   * carries no cost field today, or a slot that no longer exists) is
   * counted in `unpricedSaleCount`, never silently zero-cost.
   */
  async computeCogsForPeriod(businessId: string, machineId: string, periodStart: Date, periodEnd: Date): Promise<{ cogsKes: number; unpricedSaleCount: number }> {
    const slots = await machineSlotRepository.listByMachine(businessId, machineId);
    const slotByCode = new Map(slots.map((slot) => [slot.slotCode, slot]));
    const snackItemProductIds = new Set(
      slots.filter((slot) => slot.productCatalogue === 'snackItem' && slot.productId).map((slot) => slot.productId!),
    );
    const snackItemsById = await snackItemRepository.findManyById(Array.from(snackItemProductIds));

    let cogsKes = 0;
    let unpricedSaleCount = 0;
    for await (const { data } of machineInventoryMovementRepository.streamMovementsInRange(businessId, {
      reason: 'sale',
      machineId,
      since: periodStart,
      until: periodEnd,
    })) {
      const slot = slotByCode.get(data.slotId);
      const item = slot?.productCatalogue === 'snackItem' && slot.productId ? snackItemsById.get(slot.productId) : undefined;
      if (item) {
        cogsKes += Math.abs(data.quantityDelta) * item.expectedUnitCostKes;
      } else {
        unpricedSaleCount += 1;
      }
    }
    return { cogsKes, unpricedSaleCount };
  }

  /** This machine's active subscription charge for the settlement window — one period's `amountKes` if a subscription exists, `0` otherwise (§ SUBSCRIPTION). */
  async computeSubscriptionChargeForPeriod(businessId: string, machineId: string): Promise<number> {
    const subscription = await machineSubscriptionRepository.findActiveForMachine(businessId, machineId);
    return subscription?.data.amountKes ?? 0;
  }

  async createDraft(input: { businessId: string; machineId: string; partnerId: string; periodStart: Date; periodEnd: Date; actor: string }): Promise<string> {
    const [{ grossSalesKes, refundsKes }, { cogsKes, unpricedSaleCount }, subscriptionChargedKes, agreement] = await Promise.all([
      this.computeGrossForPeriod(input.businessId, input.machineId, input.periodStart, input.periodEnd),
      this.computeCogsForPeriod(input.businessId, input.machineId, input.periodStart, input.periodEnd),
      this.computeSubscriptionChargeForPeriod(input.businessId, input.machineId),
      partnerMachineAgreementRepository.findActiveForMachine(input.businessId, input.machineId),
    ]);

    const revenueSharePartnerPct = agreement?.data.revenueSharePartnerPct ?? null;
    const netDistributableKes = revenueSharePartnerPct === null ? null : grossSalesKes - refundsKes;
    const partnerShareKes =
      revenueSharePartnerPct !== null && netDistributableKes !== null
        ? Math.round((netDistributableKes * revenueSharePartnerPct) / 100)
        : null;
    const businessShareKes =
      partnerShareKes !== null && netDistributableKes !== null ? netDistributableKes - partnerShareKes : null;

    const distributableOwnerKes = grossSalesKes - refundsKes - cogsKes - subscriptionChargedKes;

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
      cogsKes,
      unpricedSaleCount,
      subscriptionChargedKes,
      distributableOwnerKes,
      createdBy: input.actor,
    });
  }

  /**
   * Moves a `draft` settlement to `finalized` and credits
   * `distributableOwnerKes` (adjusted by any `adjustmentKes`) to the
   * partner's wallet — both inside one Firestore transaction that
   * re-reads the settlement's current status first, the same
   * "read-check-write, all inside the transaction" discipline
   * `WithdrawalService.approveWithdrawal` already uses for its own
   * double-payment protection (§ SETTLEMENT: "must be idempotent. Do
   * not double-credit an owner if settlement runs twice"). A second
   * `finalize()` call on an already-`finalized` settlement throws
   * `IllegalSettlementTransitionError` rather than crediting again.
   */
  async finalize(businessId: string, settlementId: string, actor: string): Promise<void> {
    await adminFirestore.runTransaction(async (tx) => {
      const found = await machineSettlementRepository.getInTransaction(tx, businessId, settlementId);
      if (!found) {
        throw new MachineSettlementNotFoundError(settlementId);
      }
      if (found.data.status !== 'draft') {
        throw new IllegalSettlementTransitionError(found.data.status, 'finalized');
      }
      const amountKes = found.data.distributableOwnerKes + found.data.adjustmentKes;
      creditEarningsInTransaction(tx, found.data.partnerId, amountKes, {
        type: 'settlement',
        settlementId,
        machineId: found.data.machineId,
        amountKes,
      });
      machineSettlementRepository.finalizeInTransaction(tx, found.ref, actor);
    });
  }

  async listByMachine(businessId: string, machineId: string) {
    return machineSettlementRepository.listByMachine(businessId, machineId);
  }

  async listByPartner(businessId: string, partnerId: string) {
    return machineSettlementRepository.listByPartner(businessId, partnerId);
  }

  async findById(businessId: string, settlementId: string) {
    return machineSettlementRepository.findById(businessId, settlementId);
  }
}

export const machineSettlementService = new MachineSettlementService();
export { MachineSettlementService };
