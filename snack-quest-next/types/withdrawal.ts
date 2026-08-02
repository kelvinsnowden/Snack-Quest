import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';

export type WithdrawalOwnerType = 'creator' | 'customer';
/**
 * `approved` means the admin released it and the Daraja B2C request
 * was accepted for processing — not proof the money moved yet, only
 * `paid` (confirmed by the async B2C result callback) is that.
 * `failed` covers both an immediate B2C rejection at approval time and
 * a later async failure result; in both cases the reserved balance
 * (see `WithdrawalService`) is refunded to the owner and an admin can
 * approve again.
 */
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'paid' | 'failed';

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
 * `businessId`-scoped like every other collection in the multi-tenant
 * retrofit (§ Multi-tenant retrofit) — added here since nothing wrote
 * this collection until § Admin: Withdrawals, so there was no existing
 * data shape to preserve.
 */
export interface Withdrawal extends AuditFields {
  businessId: string;
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
  /** Safaricom's own correlation ids for the B2C request this withdrawal triggered — how the async result callback is matched back to this doc. Null until an admin approves it. */
  b2cOriginatorConversationId: string | null;
  b2cConversationId: string | null;
}
