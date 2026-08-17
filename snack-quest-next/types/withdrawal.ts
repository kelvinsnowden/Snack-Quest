import type { Timestamp } from 'firebase/firestore';
import type { AuditFields } from './common';
import type { B2CFailureCategory } from '@/lib/integrations/daraja/b2cResultCodes';

export type WithdrawalOwnerType = 'creator' | 'customer';
/**
 * `submitting` is the crash-safe claim state (§ Daraja B2C production
 * readiness): approving a withdrawal atomically transitions `pending`
 * → `submitting` inside one Firestore transaction that re-reads the
 * current status first and generates + persists a real
 * `b2cOriginatorConversationId` *before* the Daraja B2C call is ever
 * made. That transaction is what makes concurrent approval safe: two
 * simultaneous `approveWithdrawal` calls race on the same document,
 * Firestore's optimistic concurrency lets exactly one of them win the
 * `pending` → `submitting` write, and the loser re-reads a
 * `submitting` (no longer `pending`) doc and throws before ever
 * calling Daraja — so only one B2C request is ever sent. It's also
 * what survives a crash between "Daraja accepted the request" and "we
 * persisted the response": the correlation id needed to later ask
 * Daraja what actually happened
 * (`WithdrawalService.reconcileStuckWithdrawals`) is already durable
 * before the network call even starts.
 *
 * `approved` means Daraja's *synchronous* acknowledgement
 * (`ResponseCode: "0"`) was received — still not proof the money
 * moved, only `paid` (confirmed by the async B2C `Result.ResultCode
 * === 0` callback, or by a Transaction Status Query reconciliation
 * that gets an equally unambiguous confirmation) is that.
 *
 * `failed` covers an immediate synchronous B2C rejection, a later
 * async failure result, or a reconciliation sweep giving up after its
 * retry budget is exhausted; in every case the reserved balance (see
 * `WithdrawalService`) is refunded to the owner exactly once. A
 * `failed` withdrawal is terminal — creating a fresh withdrawal
 * request is the only way to try again, and `failureCategory` records
 * why, so a `permanent_configuration` failure doesn't just quietly
 * invite the same failure on the next attempt (see
 * `b2c_disbursements_frozen` in `lib/featureFlags/catalog.ts`).
 */
export type WithdrawalStatus = 'pending' | 'submitting' | 'approved' | 'rejected' | 'paid' | 'failed';

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
  /** Safaricom's own correlation ids for the B2C request this withdrawal triggered — how the async result callback is matched back to this doc. Set the instant a `submitting` claim is won, before Daraja is ever called (see `WithdrawalStatus`'s own doc comment) — not just once Daraja synchronously acknowledges. */
  b2cOriginatorConversationId: string | null;
  b2cConversationId: string | null;
  /** Set only on a `failed` transition — why it failed, per `lib/integrations/daraja/b2cResultCodes.ts`. Null for every other status. */
  failureCategory: B2CFailureCategory | null;
  /** Set while a stuck-withdrawal reconciliation sweep has an in-flight Transaction Status Query outstanding for this withdrawal — how `WithdrawalService.handleTransactionStatusResult` matches the async result back. Null otherwise. */
  pendingStatusQueryOriginatorConversationId: string | null;
  /** How many times the reconciliation sweep has queried Daraja's Transaction Status API about this withdrawal — bounds its own retry budget, independent of how many sweep runs have happened. 0 until the first query. */
  statusQueryAttemptCount: number;
}
