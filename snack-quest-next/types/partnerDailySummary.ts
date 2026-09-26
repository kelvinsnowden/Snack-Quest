import type { Timestamp } from 'firebase/firestore';

/**
 * `partnerDailySummary/{partnerId}__{date}` — a partner's whole
 * portfolio for one day, in one document (§ ANALYTICS, § RBAC "27
 * machines, one read", docs/FLEET_ARCHITECTURE_AUDIT.md §6). Built by
 * summing that partner's own `machineDailySummary` documents for the
 * day, not by re-streaming raw transactions per partner — the same
 * "compose from the smaller rollup" shape `docs/ANALYTICS_ROLLUPS.md`
 * §4 uses lifetime-over-orders for, applied one level up.
 *
 * Deliberately excludes any revenue-share figure: that depends on
 * `PartnerMachineAgreement.revenueSharePartnerPct`, which is nullable
 * and per-machine, not a single number a portfolio total could average
 * over without inventing one. `machineSettlementService` is where a
 * partner's actual payable amount lives, once an agreement exists.
 */
export interface PartnerDailySummary {
  businessId: string;
  partnerId: string;
  date: string;
  /** How many machines this partner owned as of the rebuild — not necessarily how many transacted that day. */
  machineCount: number;
  transactionCount: number;
  dispensedCount: number;
  grossSalesKes: number;
  refundsKes: number;
  faultCount: number;
  rebuiltAt: Timestamp;
}

export function partnerDailySummaryDocId(partnerId: string, date: string): string {
  return `${partnerId}__${date}`;
}
