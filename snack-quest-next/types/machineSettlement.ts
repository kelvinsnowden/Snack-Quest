import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * `machineSettlements/{settlementId}` — the shape a revenue-share
 * settlement will take, once terms exist (§ CORE ENTITIES 9, § "do
 * not invent commercial terms").
 *
 * `grossSalesKes` and `refundsKes` are the only two fields this
 * codebase can actually compute today, from `machineTransactions` —
 * everything else is nullable and stays null until
 * `partnerMachineAgreements` has real terms to compute it from.
 * Nothing here is invented arithmetic (never `grossSalesKes / 2`,
 * per the brief's own instruction); `netDistributableKes`,
 * `partnerShareKes` and `businessShareKes` are computed only once an
 * active agreement supplies a real `revenueSharePartnerPct`, and a
 * settlement created before one exists reports them as null rather
 * than as a number nobody agreed to.
 */
export type MachineSettlementStatus = 'draft' | 'finalized' | 'paid';

export interface MachineSettlement extends AuditFields {
  businessId: string;
  machineId: string;
  partnerId: string;
  agreementId: string | null;
  periodStart: Timestamp;
  periodEnd: Timestamp;
  status: MachineSettlementStatus;
  grossSalesKes: number;
  refundsKes: number;
  /** Null until an operating-cost model exists — see `PartnerMachineAgreement.operatingCostNote`. */
  operatingCostsKes: number | null;
  /** Any correction applied by a staff member, with a required reason — never silent. */
  adjustmentKes: number;
  adjustmentReason: string | null;
  /** Null until `agreementId` resolves to an agreement with a real `revenueSharePartnerPct`. */
  netDistributableKes: number | null;
  partnerShareKes: number | null;
  businessShareKes: number | null;
  finalizedAt: Timestamp | null;
  paidAt: Timestamp | null;
}
