import 'server-only';

import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import {
  withdrawalRepository,
  auditEntry,
} from '@/repositories/withdrawalRepository';
import {
  creatorRepository,
  reserveBalanceInTransaction,
  refundBalanceInTransaction,
  InsufficientCreatorBalanceError,
} from '@/repositories/creatorRepository';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { userRepository } from '@/repositories/userRepository';
import { darajaGateway } from '@/lib/integrations/daraja/darajaGateway';
import { publishEvent } from '@/lib/events/eventBus';
import { notificationService } from '@/services/notificationService';
import { featureFlagService } from '@/services/featureFlagService';
import { getSiteUrl } from '@/lib/seo/siteUrl';
import { MIN_WITHDRAWAL_KES, MAX_WITHDRAWAL_KES } from '@/lib/withdrawals/rules';
import { formatKes } from '@/lib/orders/format';
import { assertCreatorFinancialWritesNotFrozen, CreatorFinancialWritesFrozenError } from '@/lib/creators/creatorFinancialFreeze';
import { assertB2CDisbursementsNotFrozen, B2CDisbursementsFrozenError } from '@/lib/withdrawals/b2cFreeze';
import { classifyB2CResultCode, classifyB2CGatewayError, type B2CFailureCategory } from '@/lib/integrations/daraja/b2cResultCodes';
import type { Withdrawal, WithdrawalOwnerType, WithdrawalStatus } from '@/types';

export { InsufficientCreatorBalanceError, CreatorFinancialWritesFrozenError, B2CDisbursementsFrozenError };

export class WithdrawalNotFoundError extends Error {
  constructor(withdrawalId: string) {
    super(`Withdrawal ${withdrawalId} not found`);
    this.name = 'WithdrawalNotFoundError';
  }
}

export class InvalidWithdrawalTransitionError extends Error {
  constructor(from: WithdrawalStatus, action: string) {
    super(`Cannot ${action} a withdrawal that is '${from}'`);
    this.name = 'InvalidWithdrawalTransitionError';
  }
}

export class CreatorNotEligibleForWithdrawalError extends Error {
  constructor(creatorId: string) {
    super(`${creatorId} is not an active creator for this business`);
    this.name = 'CreatorNotEligibleForWithdrawalError';
  }
}

export class WithdrawalBelowMinimumError extends Error {
  constructor(amountKes: number) {
    super(
      `Withdrawal amount ${formatKes(amountKes)} is below the minimum of ${formatKes(MIN_WITHDRAWAL_KES)}.`,
    );
    this.name = 'WithdrawalBelowMinimumError';
  }
}

export class WithdrawalAboveMaximumError extends Error {
  constructor(amountKes: number) {
    super(
      `Withdrawal amount ${formatKes(amountKes)} is above the maximum of ${formatKes(MAX_WITHDRAWAL_KES)} Daraja allows in a single B2C transaction.`,
    );
    this.name = 'WithdrawalAboveMaximumError';
  }
}

export class UnsupportedWithdrawalOwnerTypeError extends Error {
  constructor(ownerType: string) {
    super(
      `Withdrawals for ownerType "${ownerType}" aren't supported yet — only 'creator' withdrawals (backed by creatorMemberships.availableCashKes) are wired up. There is no real customer wallet-cashout journey in this codebase to withdraw from.`,
    );
    this.name = 'UnsupportedWithdrawalOwnerTypeError';
  }
}

const B2C_REMARKS = 'Snack Quest creator withdrawal';

/**
 * How long a withdrawal can sit in `'submitting'`/`'approved'` before
 * the reconciliation sweep (§ Daraja B2C production readiness) will
 * query Daraja about it. B2C's own async result normally lands within
 * seconds to low minutes — nothing like STK's customer-PIN-entry wait
 * — so this threshold is deliberately short.
 */
const DEFAULT_STUCK_AFTER_MS = 3 * 60 * 1000;
/** Same "actual sensible retry limit" reasoning as `PaymentService`'s STK reconciliation sweep. */
const DEFAULT_MAX_QUERY_ATTEMPTS = 5;
/** Same time-based backstop reasoning as `PaymentService`'s STK reconciliation sweep. */
const DEFAULT_EXPIRE_AFTER_MS = 6 * 60 * 60 * 1000;

export interface WithdrawalReconciliationOutcome {
  withdrawalId: string;
  outcome: 'queried' | 'needsManualReview' | 'stillPending' | 'skipped';
  reviewReason?: string;
}

/**
 * Owns the withdrawal lifecycle (§ Admin: Withdrawals, § Daraja B2C
 * production readiness): request → approve (reserves the balance at
 * request time, not approval time, so two pending requests can never
 * together exceed what's actually available) → Daraja B2C payout →
 * paid (confirmed by the async result callback, or by an unambiguous
 * Transaction Status Query reconciliation) or failed (refunds the
 * reservation, exactly once). Only `ownerType: 'creator'` is wired to
 * a real balance source right now — `creatorMemberships.availableCashKes`,
 * credited by real referral commissions (§ Admin: Referrals).
 * `'customer'` is a real, documented schema value (TDD §8) with no
 * real wallet-cashout journey behind it yet; `requestWithdrawal` fails
 * closed rather than silently debiting a `customerProfiles` collection
 * nothing else in this codebase writes to (§ Admin: Customers found
 * the same gap).
 *
 * `approveWithdrawal`/`rejectWithdrawal` never do a plain
 * read-then-write on a withdrawal's status — every transition that
 * matters financially reads the document *inside* the same Firestore
 * transaction that performs the write, so two concurrent admin actions
 * on the same withdrawal can never both succeed (Firestore's
 * optimistic concurrency guarantees the loser re-reads the
 * already-changed document and throws before doing anything
 * financial). See `WithdrawalStatus`'s own doc comment for the full
 * `pending → submitting → approved → paid` state machine this
 * protects.
 */
class WithdrawalService {
  async requestWithdrawal(input: {
    businessId: string;
    ownerId: string;
    ownerType: WithdrawalOwnerType;
    amountKes: number;
    phoneNumber: string;
  }): Promise<string> {
    if (input.ownerType !== 'creator') {
      throw new UnsupportedWithdrawalOwnerTypeError(input.ownerType);
    }
    if (input.amountKes < MIN_WITHDRAWAL_KES) {
      throw new WithdrawalBelowMinimumError(input.amountKes);
    }
    if (input.amountKes > MAX_WITHDRAWAL_KES) {
      throw new WithdrawalAboveMaximumError(input.amountKes);
    }
    await assertCreatorFinancialWritesNotFrozen(input.businessId);

    const creator = await creatorRepository.findById(input.businessId, input.ownerId);
    if (!creator || creator.businessId !== input.businessId || creator.status !== 'active') {
      throw new CreatorNotEligibleForWithdrawalError(input.ownerId);
    }

    return adminFirestore.runTransaction(async (tx) => {
      await reserveBalanceInTransaction(tx, input.businessId, input.ownerId, input.amountKes);
      return withdrawalRepository.createInTransaction(
        tx,
        {
          businessId: input.businessId,
          ownerId: input.ownerId,
          ownerType: input.ownerType,
          amountKes: input.amountKes,
          phoneNumber: input.phoneNumber,
          status: 'pending',
          // No real fraud-scoring model exists yet — an honest 0, never a fabricated score.
          fraudScore: 0,
          auditTrail: [auditEntry('requested', input.ownerId)],
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null,
          paidAt: null,
          b2cOriginatorConversationId: null,
          b2cConversationId: null,
          failureCategory: null,
          pendingStatusQueryOriginatorConversationId: null,
          statusQueryAttemptCount: 0,
        },
        input.ownerId,
      );
    });
  }

  /**
   * Approves a pending withdrawal and immediately initiates the real
   * Daraja B2C payout. Returns the withdrawal's status after the
   * attempt — `'approved'` if Safaricom accepted the request for
   * processing (not yet proof of payment; that's `handleB2CResult`/
   * `handleTransactionStatusResult`), or `'failed'` if the B2C call
   * itself was rejected synchronously, in which case the reserved
   * balance is refunded immediately.
   *
   * The `pending` → `submitting` transition below is the one Firestore
   * transaction in this whole flow that matters most: it reads the
   * withdrawal's current status and, only if it's still `'pending'`,
   * generates a fresh `OriginatorConversationID` and persists it —
   * *before* Daraja is ever contacted — all inside one transaction.
   * Two concurrent calls to this method for the same withdrawal (an
   * admin double-click, a client retry, two admins) race on that same
   * transaction; Firestore lets exactly one win, and the other re-reads
   * a document that's no longer `'pending'` and throws
   * `InvalidWithdrawalTransitionError` before ever calling Daraja. That
   * is what makes "exactly one B2C request per withdrawal" true even
   * under real concurrency, not just in the common case.
   */
  async approveWithdrawal(businessId: string, withdrawalId: string, actor: string): Promise<WithdrawalStatus> {
    await assertCreatorFinancialWritesNotFrozen(businessId);
    await assertB2CDisbursementsNotFrozen(businessId);

    const originatorConversationId = randomUUID();
    const claimed = await adminFirestore.runTransaction(async (tx) => {
      const found = await withdrawalRepository.getInTransaction(tx, businessId, withdrawalId);
      if (!found) {
        throw new WithdrawalNotFoundError(withdrawalId);
      }
      if (found.data.status !== 'pending') {
        throw new InvalidWithdrawalTransitionError(found.data.status, 'approve');
      }
      tx.update(found.ref, {
        status: 'submitting' satisfies WithdrawalStatus,
        b2cOriginatorConversationId: originatorConversationId,
        auditTrail: [...found.data.auditTrail, auditEntry('submitting', actor)],
        updatedAt: Timestamp.now(),
        updatedBy: actor,
      });
      return found.data;
    });

    try {
      const result = await darajaGateway.initiateB2CPayment({
        businessId,
        phone: claimed.phoneNumber,
        amountKes: claimed.amountKes,
        remarks: B2C_REMARKS,
        occasion: withdrawalId,
        originatorConversationId,
      });

      await withdrawalRepository.applyTransition(
        withdrawalId,
        {
          status: 'approved',
          approvedBy: actor,
          approvedAt: Timestamp.now() as unknown as Withdrawal['approvedAt'],
          b2cConversationId: result.conversationId,
        },
        auditEntry('approved', actor, `B2C request accepted (${originatorConversationId})`),
        actor,
      );
      await publishEvent(businessId, 'WithdrawalApproved', 'withdrawal', withdrawalId, {
        actor,
        originatorConversationId,
      });

      const owner = await userRepository.findById(claimed.ownerId);
      if (owner?.email) {
        try {
          await notificationService.send(businessId, {
            channel: 'email',
            templateCode: 'withdrawal_approved_email',
            recipientType: 'creator',
            recipientId: claimed.ownerId,
            recipientRef: owner.email,
            params: {
              displayName: owner.displayName,
              amountKes: String(claimed.amountKes),
              portalUrl: `${getSiteUrl()}/creator/withdrawals`,
            },
            dedupeKey: `withdrawal-approved:${withdrawalId}`,
          });
        } catch {
          // Best-effort — the payout itself already succeeded above.
        }
      }

      return 'approved';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown B2C initiation failure';
      const { category, explanation } = classifyB2CGatewayError(message);
      await adminFirestore.runTransaction(async (tx) => {
        refundBalanceInTransaction(tx, businessId, claimed.ownerId, claimed.amountKes);
        withdrawalRepository.applyTransitionInTransaction(
          tx,
          withdrawalId,
          { status: 'failed', failureCategory: category },
          auditEntry('b2c_initiation_failed', actor, message),
          actor,
        );
      });
      await publishEvent(businessId, 'WithdrawalFailed', 'withdrawal', withdrawalId, { actor, reason: message, category });
      await this.reactToFailureCategory(businessId, category, `B2C payout initiation for withdrawal ${withdrawalId} failed (${explanation}): ${message}`);
      return 'failed';
    }
  }

  /**
   * Rejects a pending withdrawal and refunds the reserved balance,
   * both inside one Firestore transaction that re-reads the current
   * status first — the same protection `approveWithdrawal` gets.
   * Without this, two concurrent reject calls on the same pending
   * withdrawal could each independently pass a stale status check and
   * each refund the balance once, crediting the creator twice for one
   * rejected request; reading the status inside the transaction that
   * performs the refund closes that race the same way the
   * `pending → submitting` claim closes the double-approval one.
   */
  async rejectWithdrawal(businessId: string, withdrawalId: string, actor: string, reason: string): Promise<void> {
    await assertCreatorFinancialWritesNotFrozen(businessId);

    await adminFirestore.runTransaction(async (tx) => {
      const found = await withdrawalRepository.getInTransaction(tx, businessId, withdrawalId);
      if (!found) {
        throw new WithdrawalNotFoundError(withdrawalId);
      }
      if (found.data.status !== 'pending') {
        throw new InvalidWithdrawalTransitionError(found.data.status, 'reject');
      }
      refundBalanceInTransaction(tx, businessId, found.data.ownerId, found.data.amountKes);
      withdrawalRepository.applyTransitionInTransaction(
        tx,
        withdrawalId,
        { status: 'rejected', rejectionReason: reason },
        auditEntry('rejected', actor, reason),
        actor,
      );
    });
    await publishEvent(businessId, 'WithdrawalRejected', 'withdrawal', withdrawalId, { actor, reason });
  }

  /**
   * The Daraja B2C result webhook (§ Admin: Withdrawals, § Daraja B2C
   * production readiness). Idempotent via `webhookEventRepository` —
   * Safaricom redelivers on timeout, same discipline as every other
   * provider webhook. A result for a withdrawal this business doesn't
   * recognize is logged and acknowledged, never an error the webhook
   * route should surface to Safaricom (that would just trigger
   * pointless redelivery).
   *
   * Only ever mutates a withdrawal still in `'submitting'` or
   * `'approved'` — a result that arrives after the withdrawal has
   * already been resolved some other way (a reconciliation sweep gave
   * up and a human manually resolved it, most plausibly) is recorded
   * for the audit trail but never allowed to silently overwrite that
   * resolution.
   */
  async handleB2CResult(businessId: string, payload: unknown): Promise<void> {
    const result = darajaGateway.verifyB2CResult(payload);

    const match = await withdrawalRepository.findByOriginatorConversationId(
      businessId,
      result.originatorConversationId,
    );

    const idempotency = await webhookEventRepository.recordIfNew({
      businessId,
      provider: 'daraja',
      eventKind: 'b2c_result',
      providerEventId: result.originatorConversationId,
      payload: payload as Record<string, unknown>,
      relatedEntityId: match?.id ?? null,
    });
    if (!idempotency.isNew) {
      return;
    }

    if (!match) {
      await webhookEventRepository.markFailed(
        businessId,
        'daraja',
        result.originatorConversationId,
        `No withdrawal found for originatorConversationId ${result.originatorConversationId}`,
      );
      return;
    }

    if (match.data.status !== 'submitting' && match.data.status !== 'approved') {
      // Already resolved some other way (manual resolution, or — in
      // principle — a prior delivery of this exact result that lost a
      // race with this one at the idempotency check above, which can't
      // actually happen given recordIfNew's atomicity, but a status
      // guard here costs nothing and protects against any future
      // second path that can reach this withdrawal). Never overwrite.
      await webhookEventRepository.markProcessed(businessId, 'daraja', result.originatorConversationId);
      return;
    }

    if (result.succeeded) {
      await withdrawalRepository.applyTransition(
        match.id,
        { status: 'paid', paidAt: Timestamp.now() as unknown as Withdrawal['paidAt'], pendingStatusQueryOriginatorConversationId: null },
        auditEntry('b2c_confirmed', 'system', result.transactionId),
        'system',
      );
      await publishEvent(businessId, 'WithdrawalPaid', 'withdrawal', match.id, {
        transactionId: result.transactionId,
      });
    } else {
      const { category, explanation } = classifyB2CResultCode(result.resultCode);
      await adminFirestore.runTransaction(async (tx) => {
        refundBalanceInTransaction(tx, businessId, match.data.ownerId, match.data.amountKes);
        withdrawalRepository.applyTransitionInTransaction(
          tx,
          match.id,
          { status: 'failed', failureCategory: category, pendingStatusQueryOriginatorConversationId: null },
          auditEntry('b2c_failed', 'system', result.resultDesc),
          'system',
        );
      });
      await publishEvent(businessId, 'WithdrawalFailed', 'withdrawal', match.id, { reason: result.resultDesc, category });
      await this.reactToFailureCategory(businessId, category, `B2C payout for withdrawal ${match.id} failed (${explanation}): ${result.resultDesc}`);
    }

    await webhookEventRepository.markProcessed(businessId, 'daraja', result.originatorConversationId);
  }

  /**
   * The Transaction Status Query result webhook (§ Daraja B2C
   * production readiness — stuck-withdrawal reconciliation). Extremely
   * conservative by design: the only outcome this is ever allowed to
   * auto-resolve is an unambiguous `resultCode === 0` with
   * `transactionStatus === 'Completed'` and a real transaction id —
   * anything else (including a query failure, a missing status, or any
   * status text this codebase doesn't recognize) leaves the withdrawal
   * exactly as it was and escalates to a human via
   * `notificationService.notifyAdmin`, never guesses. This is the same
   * "never fabricate a successful payment" discipline
   * `PaymentService.reconcileStuckIntents` already applies to STK.
   */
  async handleTransactionStatusResult(businessId: string, payload: unknown): Promise<void> {
    const result = darajaGateway.verifyTransactionStatusResult(payload);

    const match = await withdrawalRepository.findByPendingStatusQueryId(
      businessId,
      result.originatorConversationId,
    );

    const idempotency = await webhookEventRepository.recordIfNew({
      businessId,
      provider: 'daraja',
      eventKind: 'transaction_status_result',
      providerEventId: result.originatorConversationId,
      payload: payload as Record<string, unknown>,
      relatedEntityId: match?.id ?? null,
    });
    if (!idempotency.isNew) {
      return;
    }

    if (!match) {
      await webhookEventRepository.markFailed(
        businessId,
        'daraja',
        result.originatorConversationId,
        `No withdrawal found awaiting a status query result for ${result.originatorConversationId}`,
      );
      return;
    }

    if (match.data.status !== 'submitting' && match.data.status !== 'approved') {
      await webhookEventRepository.markProcessed(businessId, 'daraja', result.originatorConversationId);
      return;
    }

    const confirmedPaid = result.resultCode === 0 && result.transactionStatus === 'Completed' && Boolean(result.transactionId);

    if (confirmedPaid) {
      await withdrawalRepository.applyTransition(
        match.id,
        { status: 'paid', paidAt: Timestamp.now() as unknown as Withdrawal['paidAt'], pendingStatusQueryOriginatorConversationId: null },
        auditEntry('status_query_confirmed_paid', 'system', result.transactionId),
        'system',
      );
      await publishEvent(businessId, 'WithdrawalPaid', 'withdrawal', match.id, {
        transactionId: result.transactionId,
        source: 'transaction_status_query',
      });
    } else {
      // Deliberately does NOT refund or change status — an inconclusive
      // status-query result is not proof of failure, only proof that
      // this codebase still doesn't know what happened. A human must
      // resolve it via `resolveAmbiguousWithdrawal` after checking
      // Safaricom's own records directly.
      await notificationService.notifyAdmin(
        businessId,
        `URGENT: Transaction Status Query for withdrawal ${match.id} returned an inconclusive result (resultCode=${result.resultCode}, transactionStatus=${result.transactionStatus ?? 'none'}). Balance remains reserved. Check the M-Pesa statement directly and resolve manually.`,
      );
    }

    await webhookEventRepository.markProcessed(businessId, 'daraja', result.originatorConversationId);
  }

  /**
   * The B2C equivalent of `PaymentService.reconcileStuckIntents` (§
   * Daraja B2C production readiness) — for a withdrawal still
   * `'submitting'`/`'approved'` because its B2C result (or even its
   * synchronous acknowledgement, in the `'submitting'` crash-window
   * case) never arrived. Never resolves a withdrawal itself; only ever
   * issues a Transaction Status Query (whose async result
   * `handleTransactionStatusResult` above handles) or gives up and
   * escalates once the retry budget is exhausted — exactly the
   * `stillPending` / `needsManualReview` split `reconcileStuckIntents`
   * already uses for STK, applied to B2C.
   */
  async reconcileStuckWithdrawals(
    businessId: string,
    options: { stuckAfterMs?: number; expireAfterMs?: number; maxQueryAttempts?: number } = {},
  ): Promise<WithdrawalReconciliationOutcome[]> {
    const stuckAfterMs = options.stuckAfterMs ?? DEFAULT_STUCK_AFTER_MS;
    const expireAfterMs = options.expireAfterMs ?? DEFAULT_EXPIRE_AFTER_MS;
    const maxQueryAttempts = options.maxQueryAttempts ?? DEFAULT_MAX_QUERY_ATTEMPTS;
    const now = Date.now();

    const stuckCandidates = await withdrawalRepository.listByStatuses(businessId, ['submitting', 'approved']);
    const outcomes: WithdrawalReconciliationOutcome[] = [];

    for (const { id: withdrawalId, data: withdrawal } of stuckCandidates) {
      const updatedAtMs = withdrawal.updatedAt.toMillis();
      const ageMs = now - updatedAtMs;
      if (ageMs < stuckAfterMs) {
        continue; // still within a normal processing window — not stuck yet
      }

      if (withdrawal.statusQueryAttemptCount >= maxQueryAttempts || ageMs >= expireAfterMs) {
        outcomes.push({
          withdrawalId,
          outcome: 'needsManualReview',
          reviewReason: `Withdrawal ${withdrawalId} has been stuck '${withdrawal.status}' for ${Math.round(ageMs / 60_000)} minutes across ${withdrawal.statusQueryAttemptCount} status quer${withdrawal.statusQueryAttemptCount === 1 ? 'y' : 'ies'} with no definitive result from Daraja. Balance remains reserved. Investigate against the M-Pesa statement and resolve manually.`,
        });
        continue;
      }

      if (!withdrawal.b2cOriginatorConversationId) {
        // Should be unreachable — 'submitting'/'approved' always set
        // this at claim time — but never query with an empty id.
        outcomes.push({
          withdrawalId,
          outcome: 'needsManualReview',
          reviewReason: `Withdrawal ${withdrawalId} is '${withdrawal.status}' with no recorded b2cOriginatorConversationId — cannot query Daraja. Investigate directly.`,
        });
        continue;
      }

      // Persist the query's own correlation id and bump the retry
      // counter BEFORE calling Daraja, in one transaction — the same
      // crash-safety discipline `approveWithdrawal` applies to the
      // original B2C call. Worst case on a crash right after this
      // commits but before the fetch below: one attempt slot in the
      // retry budget is "spent" without a real query ever reaching
      // Daraja — safe, bounded, never a money-loss path.
      const queryConversationId = randomUUID();
      const nextAttemptCount = withdrawal.statusQueryAttemptCount + 1;
      await adminFirestore.runTransaction(async (tx) => {
        const found = await withdrawalRepository.getInTransaction(tx, businessId, withdrawalId);
        if (!found) return;
        tx.update(found.ref, {
          pendingStatusQueryOriginatorConversationId: queryConversationId,
          statusQueryAttemptCount: nextAttemptCount,
          auditTrail: [...found.data.auditTrail, auditEntry('status_query_issued', 'system', `attempt ${nextAttemptCount}`)],
          updatedAt: Timestamp.now(),
          updatedBy: 'system',
        });
      });

      try {
        await darajaGateway.queryTransactionStatus({
          businessId,
          originatorConversationId: withdrawal.b2cOriginatorConversationId,
          remarks: B2C_REMARKS,
          occasion: withdrawalId,
        });
        outcomes.push({ withdrawalId, outcome: 'queried' });
      } catch (error) {
        // The query submission itself failed (network/gateway) — the
        // withdrawal is untouched beyond the attempt count already
        // persisted above, still eligible for another try next sweep.
        outcomes.push({
          withdrawalId,
          outcome: 'stillPending',
          reviewReason: error instanceof Error ? error.message : 'Transaction status query submission failed',
        });
      }
    }

    return outcomes;
  }

  /**
   * A human's explicit, audited resolution of a withdrawal the
   * automated paths above have given up on (§ Daraja B2C production
   * readiness) — after checking Safaricom's own merchant statement
   * directly, outside this system. This is the only way a withdrawal
   * that `reconcileStuckWithdrawals` marked `needsManualReview` (or
   * that a status-query result left inconclusive) ever leaves that
   * state; nothing here auto-resolves it. Same transactional
   * status-check-then-write discipline as `approveWithdrawal`/
   * `rejectWithdrawal` — two concurrent resolutions can't both apply.
   */
  async resolveAmbiguousWithdrawal(
    businessId: string,
    withdrawalId: string,
    actor: string,
    resolution: 'confirmed_paid' | 'confirmed_failed',
    note: string,
  ): Promise<void> {
    await adminFirestore.runTransaction(async (tx) => {
      const found = await withdrawalRepository.getInTransaction(tx, businessId, withdrawalId);
      if (!found) {
        throw new WithdrawalNotFoundError(withdrawalId);
      }
      if (found.data.status !== 'submitting' && found.data.status !== 'approved') {
        throw new InvalidWithdrawalTransitionError(found.data.status, 'resolve');
      }

      if (resolution === 'confirmed_paid') {
        withdrawalRepository.applyTransitionInTransaction(
          tx,
          withdrawalId,
          { status: 'paid', paidAt: Timestamp.now() as unknown as Withdrawal['paidAt'], pendingStatusQueryOriginatorConversationId: null },
          auditEntry('manually_resolved_paid', actor, note),
          actor,
        );
      } else {
        refundBalanceInTransaction(tx, businessId, found.data.ownerId, found.data.amountKes);
        withdrawalRepository.applyTransitionInTransaction(
          tx,
          withdrawalId,
          { status: 'failed', failureCategory: 'ambiguous', pendingStatusQueryOriginatorConversationId: null },
          auditEntry('manually_resolved_failed', actor, note),
          actor,
        );
      }
    });

    await publishEvent(
      businessId,
      resolution === 'confirmed_paid' ? 'WithdrawalPaid' : 'WithdrawalFailed',
      'withdrawal',
      withdrawalId,
      { actor, note, manual: true },
    );
  }

  async listWithdrawals(
    businessId: string,
    options: { status?: WithdrawalStatus; cursor?: string } = {},
  ): Promise<{ withdrawals: { id: string; data: Withdrawal }[]; nextCursor: string | null }> {
    return withdrawalRepository.listByBusiness(businessId, options);
  }

  /** § Creator Portal withdrawals — a creator's own request history. */
  async listWithdrawalsForOwner(
    businessId: string,
    ownerId: string,
    options: { cursor?: string } = {},
  ): Promise<{ withdrawals: { id: string; data: Withdrawal }[]; nextCursor: string | null }> {
    return withdrawalRepository.listByOwner(businessId, ownerId, options);
  }

  /**
   * Shared reaction to a classified B2C failure (§ Daraja B2C
   * production readiness) — called from both the synchronous rejection
   * path in `approveWithdrawal` and the async failure path in
   * `handleB2CResult`. A `permanent_configuration` failure auto-freezes
   * `b2c_disbursements_frozen` so the next admin approval can't walk
   * into the identical wall; every category still gets an urgent admin
   * alert except `recipient` (routine — the creator's own account is
   * the constraint, not something an operator needs to act on).
   */
  private async reactToFailureCategory(businessId: string, category: B2CFailureCategory, detail: string): Promise<void> {
    if (category === 'permanent_configuration') {
      await featureFlagService.setEnabled(businessId, 'b2c_disbursements_frozen', true, 'system');
      await notificationService.notifyAdmin(
        businessId,
        `URGENT: B2C disbursements auto-paused for this business — ${detail}. Fix the Daraja B2C credentials in the Integration Portal, then clear "Freeze B2C disbursements" in Feature Flags before approving any further withdrawal.`,
      );
      return;
    }
    if (category === 'account_funding' || category === 'ambiguous') {
      await notificationService.notifyAdmin(businessId, `URGENT: ${detail}`);
    }
  }
}

export const withdrawalService = new WithdrawalService();
export { WithdrawalService };
