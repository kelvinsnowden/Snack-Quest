import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

export type WithdrawalOwnerType = 'creator' | 'customer';
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface WithdrawalAuditEntry {
  action: string;
  actorId: string;
  at: Timestamp;
  note?: string;
}

/**
 * `withdrawals/{withdrawalId}` — the unified payout collection that
 * replaces the current system's three competing withdrawal
 * implementations (`CREATOR_PORTAL_TECH_DEBT.md` §1, TDD §8/§24).
 */
export interface Withdrawal extends AuditFields {
  ownerId: string;
  ownerType: WithdrawalOwnerType;
  amountKes: number;
  phoneNumber: string;
  status: WithdrawalStatus;
  fraudScore: number;
  auditTrail: WithdrawalAuditEntry[];
  approvedBy: string | null;
  approvedAt: Timestamp | null;
  rejectionReason: string | null;
  paidAt: Timestamp | null;
}
