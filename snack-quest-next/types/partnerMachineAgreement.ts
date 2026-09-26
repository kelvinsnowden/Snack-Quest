import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

/**
 * `partnerMachineAgreements/{agreementId}` — the commercial
 * relationship between a partner and a machine, structurally present
 * before any commercial term is actually set (§ CORE ENTITIES 8,
 * § "create the foundation for future partner-owned machines without
 * hardcoding commercial terms yet").
 *
 * Every term below is nullable and starts null. This deliberately
 * does not invent a revenue-share percentage, an operating-cost
 * allocation, or which party owns the machine outright — those are
 * the CMA-legal-review-gated decisions
 * docs/FLEET_ARCHITECTURE_AUDIT.md §19 already flagged as needing
 * product/legal input before they exist anywhere in this codebase.
 * What this type fixes is the *shape* the terms will fill once set,
 * so `machineSettlementService` has somewhere real to read them from
 * rather than a number typed into a settlement calculation directly.
 */
export type PartnerMachineAgreementStatus = 'draft' | 'active' | 'terminated';

export interface PartnerMachineAgreement extends AuditFields {
  businessId: string;
  partnerId: string;
  machineId: string;
  status: PartnerMachineAgreementStatus;
  /** Null until legal/commercial terms are actually agreed — never a placeholder number. */
  revenueSharePartnerPct: number | null;
  /** Free text pending a real structured cost model — see `docs/FLEET_ARCHITECTURE_AUDIT.md` §25 for why operating-cost allocation is deliberately not modelled as a single number yet. */
  operatingCostNote: string | null;
  effectiveFrom: Timestamp | null;
  effectiveTo: Timestamp | null;
  /** A link/reference to the actual signed agreement document, once one exists — never the terms themselves inlined here as trusted data. */
  documentRef: string | null;
  note: string | null;
}
