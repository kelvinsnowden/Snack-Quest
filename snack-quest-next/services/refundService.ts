import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { orderRepository } from '@/repositories/orderRepository';
import { orderService, OrderNotFoundError } from '@/services/orderService';
import { refundRepository, refundAuditEntry } from '@/repositories/refundRepository';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { darajaGateway } from '@/lib/integrations/daraja/darajaGateway';
import { publishEvent } from '@/lib/events/eventBus';
import type { Refund, RefundStatus } from '@/types';

export { OrderNotFoundError };

export class RefundNotPossibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefundNotPossibleError';
  }
}

export class RefundAlreadyInProgressError extends Error {
  constructor(orderId: string) {
    super(`Order ${orderId} already has a refund in progress or completed`);
    this.name = 'RefundAlreadyInProgressError';
  }
}

/**
 * Owns the refund lifecycle (§ RefundService + Daraja reversal
 * support): a staff member flags an order `refund_requested`
 * (§ Admin: Orders — unchanged, that's just intent), then this Service
 * actually moves the money back via a real Daraja Transaction Reversal
 * of the order's own M-Pesa receipt. `processing` means Safaricom
 * accepted the reversal request, not proof it completed — only
 * `succeeded` (confirmed by the async result callback, which is also
 * the only thing that ever moves `Order.status` to `refunded`) is that.
 */
class RefundService {
  async requestRefund(businessId: string, orderId: string, actor: string): Promise<RefundStatus> {
    const order = await orderRepository.findById(orderId);
    if (!order || order.businessId !== businessId) {
      throw new OrderNotFoundError(orderId);
    }
    if (order.status !== 'refund_requested') {
      throw new RefundNotPossibleError(
        `Order ${orderId} is not flagged for refund (status: ${order.status}) — mark it "refund_requested" first.`,
      );
    }
    if (!order.payment.mpesaReceiptNumber) {
      throw new RefundNotPossibleError(`Order ${orderId} has no M-Pesa receipt to reverse.`);
    }

    const existing = await refundRepository.listByOrderId(businessId, orderId);
    if (existing.some(({ data }) => data.status === 'processing' || data.status === 'succeeded')) {
      throw new RefundAlreadyInProgressError(orderId);
    }

    const refundId = await refundRepository.create(
      {
        businessId,
        orderId,
        amountKes: order.pricing.totalKes,
        reason: order.statusReason ?? 'Refund requested',
        status: 'pending',
        auditTrail: [refundAuditEntry('requested', actor)],
        requestedBy: actor,
        originalMpesaReceiptNumber: order.payment.mpesaReceiptNumber,
        reversalOriginatorConversationId: null,
        reversalConversationId: null,
        reversalTransactionId: null,
        completedAt: null,
      },
      actor,
    );

    try {
      const result = await darajaGateway.initiateReversal({
        businessId,
        transactionId: order.payment.mpesaReceiptNumber,
        amountKes: order.pricing.totalKes,
        remarks: 'Snack Quest order refund',
        occasion: orderId,
      });

      await refundRepository.applyTransition(
        refundId,
        {
          status: 'processing',
          reversalOriginatorConversationId: result.originatorConversationId,
          reversalConversationId: result.conversationId,
        },
        refundAuditEntry('reversal_accepted', actor, result.originatorConversationId),
        actor,
      );
      await publishEvent(businessId, 'RefundProcessing', 'refund', refundId, {
        orderId,
        originatorConversationId: result.originatorConversationId,
      });
      return 'processing';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown reversal initiation failure';
      await refundRepository.applyTransition(
        refundId,
        { status: 'failed' },
        refundAuditEntry('reversal_initiation_failed', actor, message),
        actor,
      );
      await publishEvent(businessId, 'RefundFailed', 'refund', refundId, { orderId, reason: message });
      return 'failed';
    }
  }

  /**
   * The Daraja reversal result webhook (§ RefundService + Daraja
   * reversal support). Idempotent via `webhookEventRepository`, exactly
   * the same discipline as `WithdrawalService.handleB2CResult`. Moving
   * `Order.status` to `refunded` is best-effort relative to the refund
   * itself succeeding — a transition conflict there must never prevent
   * this handler from acknowledging Safaricom's webhook (which would
   * just trigger pointless redelivery of a real, already-confirmed
   * reversal).
   */
  async handleReversalResult(businessId: string, payload: unknown): Promise<void> {
    const result = darajaGateway.verifyReversalResult(payload);

    const match = await refundRepository.findByOriginatorConversationId(
      businessId,
      result.originatorConversationId,
    );

    const idempotency = await webhookEventRepository.recordIfNew({
      businessId,
      provider: 'daraja',
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
        `No refund found for originatorConversationId ${result.originatorConversationId}`,
      );
      return;
    }

    if (result.succeeded) {
      await refundRepository.applyTransition(
        match.id,
        {
          status: 'succeeded',
          reversalTransactionId: result.transactionId ?? null,
          completedAt: Timestamp.now() as unknown as Refund['completedAt'],
        },
        refundAuditEntry('reversal_confirmed', 'system', result.transactionId),
        'system',
      );
      try {
        await orderService.updateStatus(businessId, match.data.orderId, 'refunded', 'system', 'M-Pesa reversal confirmed');
      } catch (error) {
        await publishEvent(businessId, 'RefundOrderStatusSyncFailed', 'refund', match.id, {
          orderId: match.data.orderId,
          reason: error instanceof Error ? error.message : 'unknown error',
        });
      }
      await publishEvent(businessId, 'RefundSucceeded', 'refund', match.id, {
        orderId: match.data.orderId,
        transactionId: result.transactionId,
      });
    } else {
      await refundRepository.applyTransition(
        match.id,
        { status: 'failed' },
        refundAuditEntry('reversal_failed', 'system', result.resultDesc),
        'system',
      );
      await publishEvent(businessId, 'RefundFailed', 'refund', match.id, {
        orderId: match.data.orderId,
        reason: result.resultDesc,
      });
    }

    await webhookEventRepository.markProcessed(businessId, 'daraja', result.originatorConversationId);
  }

  async listRefunds(
    businessId: string,
    options: { status?: RefundStatus; cursor?: string } = {},
  ): Promise<{ refunds: { id: string; data: Refund }[]; nextCursor: string | null }> {
    return refundRepository.listByBusiness(businessId, options);
  }
}

export const refundService = new RefundService();
export { RefundService };
