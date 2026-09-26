import type { Timestamp } from 'firebase/firestore';

/**
 * `partners/{partnerId}/earningsLedger/{entryId}` — the immutable
 * record backing `Partner.availableCashKes`/`lifetimeEarnedKes`
 * (§ OWNER WALLET, docs/MACHINE_COMMERCE.md §6). Same split as
 * `CreatorEarningsLedgerEntry`: the balance fields on `Partner` are
 * mutable and derived, this ledger is the append-only source of truth
 * for how they got there. Written only by
 * `MachineSettlementService.finalize()`, exactly once per settlement
 * (§ SETTLEMENT: "do not double-credit an owner if settlement runs
 * twice").
 */
export interface PartnerEarningsLedgerEntry {
  type: 'settlement';
  settlementId: string;
  machineId: string;
  amountKes: number;
  createdAt: Timestamp;
}
