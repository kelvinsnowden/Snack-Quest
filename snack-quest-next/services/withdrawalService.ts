import 'server-only';

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
import { darajaGateway } from '@/lib/integrations/daraja/darajaGateway';
import { publishEvent } from '@/lib/events/eventBus';
import type { Withdrawal, WithdrawalOwnerType, WithdrawalStatus } from '@/types';

export { InsufficientCreatorBalanceError };

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

export class UnsupportedWithdrawalOwnerTypeError extends Error {
  constructor(ownerType: string) {
    super(
      `Withdrawals for ownerType "${ownerType}" aren't supported yet — only 'creator' withdrawals (backed by creatorProfiles.availableCashKes) are wired up. There is no real customer wallet-cashout journey in this codebase to withdraw from.`,
    );
    this.name = 'UnsupportedWithdrawalOwnerTypeError';
  }
}

/**
 * Owns the withdrawal lifecycle (§ Admin: Withdrawals): request →
 * approve (reserves the balance at request time, not approval time,
 * so two pending requests can never together exceed what's actually
 * available) → Daraja B2C payout → paid (confirmed by the async
 * result callback) or failed (refunds the reservation). Only
 * `ownerType: 'creator'` is wired to a real balance source right now
 * — `creatorProfiles.availableCashKes`, credited by real referral
 * commissions (§ Admin: Referrals). `'customer'` is a real, documented
 * schema value (TDD §8) with no real wallet-cashout journey behind it
 * yet; `requestWithdrawal` fails closed rather than silently debiting
 * a `customerProfiles` collection nothing else in this codebase
 * writes to (§ Admin: Customers found the same gap).
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

    const creator = await creatorRepository.findById(input.ownerId);
    if (!creator || creator.businessId !== input.businessId) {
      throw new CreatorNotEligibleForWithdrawalError(input.ownerId);
    }

    return adminFirestore.runTransaction(async (tx) => {
      await reserveBalanceInTransaction(tx, input.ownerId, input.amountKes);
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
        },
        input.ownerId,
      );
    });
  }

  /**
   * Approves a pending withdrawal and immediately initiates the real
   * Daraja B2C payout. Returns the withdrawal's status after the
   * attempt — `'approved'` if Safaricom accepted the request for
   * processing (not yet proof of payment; that's `handleB2CResult()`),
   * or `'failed'` if the B2C call itself was rejected, in which case
   * the reserved balance is refunded immediately so the creator isn't
   * left short with no payout in flight.
   */
  async approveWithdrawal(businessId: string, withdrawalId: string, actor: string): Promise<WithdrawalStatus> {
    const withdrawal = await this.requirePending(businessId, withdrawalId, 'approve');

    try {
      const result = await darajaGateway.initiateB2CPayment({
        businessId,
        phone: withdrawal.phoneNumber,
        amountKes: withdrawal.amountKes,
        remarks: 'Snack Quest creator withdrawal',
        occasion: withdrawalId,
      });

      await withdrawalRepository.applyTransition(
        withdrawalId,
        {
          status: 'approved',
          approvedBy: actor,
          approvedAt: Timestamp.now() as unknown as Withdrawal['approvedAt'],
          b2cOriginatorConversationId: result.originatorConversationId,
          b2cConversationId: result.conversationId,
        },
        auditEntry('approved', actor, `B2C request accepted (${result.originatorConversationId})`),
        actor,
      );
      await publishEvent(businessId, 'WithdrawalApproved', 'withdrawal', withdrawalId, {
        actor,
        originatorConversationId: result.originatorConversationId,
      });
      return 'approved';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown B2C initiation failure';
      await adminFirestore.runTransaction(async (tx) => {
        refundBalanceInTransaction(tx, withdrawal.ownerId, withdrawal.amountKes);
        withdrawalRepository.applyTransitionInTransaction(
          tx,
          withdrawalId,
          { status: 'failed' },
          auditEntry('b2c_initiation_failed', actor, message),
          actor,
        );
      });
      await publishEvent(businessId, 'WithdrawalFailed', 'withdrawal', withdrawalId, { actor, reason: message });
      return 'failed';
    }
  }

  async rejectWithdrawal(businessId: string, withdrawalId: string, actor: string, reason: string): Promise<void> {
    const withdrawal = await this.requirePending(businessId, withdrawalId, 'reject');

    await adminFirestore.runTransaction(async (tx) => {
      refundBalanceInTransaction(tx, withdrawal.ownerId, withdrawal.amountKes);
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
   * The Daraja B2C result webhook (§ Admin: Withdrawals). Idempotent
   * via `webhookEventRepository` — Safaricom redelivers on timeout,
   * same discipline as every other provider webhook. A result for a
   * withdrawal this business doesn't recognize is logged and
   * acknowledged, never an error the webhook route should surface to
   * Safaricom (that would just trigger pointless redelivery).
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

    if (result.succeeded) {
      await withdrawalRepository.applyTransition(
        match.id,
        { status: 'paid', paidAt: Timestamp.now() as unknown as Withdrawal['paidAt'] },
        auditEntry('b2c_confirmed', 'system', result.transactionId),
        'system',
      );
      await publishEvent(businessId, 'WithdrawalPaid', 'withdrawal', match.id, {
        transactionId: result.transactionId,
      });
    } else {
      await adminFirestore.runTransaction(async (tx) => {
        refundBalanceInTransaction(tx, match.data.ownerId, match.data.amountKes);
        withdrawalRepository.applyTransitionInTransaction(
          tx,
          match.id,
          { status: 'failed' },
          auditEntry('b2c_failed', 'system', result.resultDesc),
          'system',
        );
      });
      await publishEvent(businessId, 'WithdrawalFailed', 'withdrawal', match.id, { reason: result.resultDesc });
    }

    await webhookEventRepository.markProcessed(businessId, 'daraja', result.originatorConversationId);
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

  private async requirePending(businessId: string, withdrawalId: string, action: string): Promise<Withdrawal> {
    const withdrawal = await withdrawalRepository.findById(businessId, withdrawalId);
    if (!withdrawal) {
      throw new WithdrawalNotFoundError(withdrawalId);
    }
    if (withdrawal.status !== 'pending') {
      throw new InvalidWithdrawalTransitionError(withdrawal.status, action);
    }
    return withdrawal;
  }
}

export const withdrawalService = new WithdrawalService();
export { WithdrawalService };
