import 'server-only';

import { machineRepository } from '@/repositories/machineRepository';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { vendingRefundRepository, vendingRefundAuditEntry, VendingRefundInFlightError } from '@/repositories/vendingRefundRepository';
import { auditLogRepository } from '@/repositories/auditLogRepository';
import { cameraService } from '@/services/cameraService';
import { machineTransactionService } from '@/services/machineTransactionService';
import { saleTraceService, type SaleTrace } from '@/services/saleTraceService';
import { darajaGateway } from '@/lib/integrations/daraja/darajaGateway';
import { logger } from '@/lib/observability/logger';
import { isCustomerSale, type AuditLog, type CameraSnapshot, type MachineTransaction, type MachineTransactionStatus, type VendingRefund } from '@/types';

/**
 * The human end of the dispense-safety design. Every sale the system
 * would not decide on its own — the machine couldn't say whether the
 * product dropped (`manual_review`), the machine provably failed after
 * the customer paid (`paid_vend_failed`), or a refund has been decided
 * but not yet sent (`refund_requested`) — lands here for a person to
 * resolve, with a written reason, from the admin screens.
 *
 * What a person can do, and only from the states where it makes sense:
 *
 * - **Confirm delivered** (`manual_review` only): the customer got it.
 *   Completes the sale exactly as a machine report would.
 * - **Refund** (`manual_review`, `paid_vend_failed`): records that the
 *   money is owed back.
 * - **Reverse the M-Pesa payment** (`refund_requested`): asks Safaricom
 *   to reverse the customer's payment. Offered only when the sale was the
 *   only item on that payment — a cart is one M-Pesa payment, and nothing
 *   here assumes Safaricom will reverse part of one.
 * - **Record a refund sent another way** (`refund_requested`): for carts,
 *   or when a reversal isn't possible; the person enters the confirmation
 *   code of the money they sent.
 *
 * Money only moves once per sale: a refund attempt is refused while
 * another is pending, processing or done (`vendingRefundRepository`).
 */

export const NEEDS_ATTENTION_STATUSES = ['manual_review', 'paid_vend_failed', 'refund_requested'] as const satisfies readonly MachineTransactionStatus[];
export type NeedsAttentionStatus = (typeof NEEDS_ATTENTION_STATUSES)[number];

export type SaleReviewAction = 'confirm_delivered' | 'start_refund' | 'reverse_payment' | 'record_refund';
export const SALE_REVIEW_ACTIONS: SaleReviewAction[] = ['confirm_delivered', 'start_refund', 'reverse_payment', 'record_refund'];

/** A reversal written but never confirmed as sent blocks a recorded refund for this long — long enough for Safaricom to answer. */
export const PENDING_REVERSAL_STALE_MS = 10 * 60 * 1000;

const NOTE_MIN = 3;
const NOTE_MAX = 500;
/** M-Pesa confirmation codes are 10 characters; other channels differ, so this only rules out obvious mistakes. */
const REFERENCE_PATTERN = /^[A-Za-z0-9-]{6,30}$/;

/** Something a person asked for that can't be done — the message says why, in words they can act on. */
export class SaleReviewError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'invalid' | 'conflict',
  ) {
    super(message);
    this.name = 'SaleReviewError';
  }
}

export interface ActionAvailability {
  action: SaleReviewAction;
  allowed: boolean;
  /** Why it can't be done right now; null when allowed. */
  reason: string | null;
}

export interface SaleReviewRow {
  id: string;
  sale: MachineTransaction;
  machineCode: string | null;
}

export interface SaleReviewDetail {
  id: string;
  sale: MachineTransaction;
  machineCode: string | null;
  trace: SaleTrace | null;
  /** Other items bought in the same M-Pesa payment (a cart). */
  cartSiblings: { id: string; sale: MachineTransaction }[];
  refunds: { id: string; data: VendingRefund }[];
  snapshots: { id: string; data: CameraSnapshot }[];
  history: { id: string; data: AuditLog }[];
  actions: ActionAvailability[];
}

export interface ResolveInput {
  action: SaleReviewAction;
  note: string;
  /** For `record_refund`: the confirmation code of the money sent. */
  reference?: string | null;
}

export interface ResolveResult {
  status: MachineTransactionStatus;
  /** For a reversal: whether Safaricom accepted the request (`processing`) or refused it (`failed`). */
  refundStatus?: VendingRefund['status'];
  message: string;
}

const ACTION_LABEL: Record<SaleReviewAction, string> = {
  confirm_delivered: 'Confirm delivered',
  start_refund: 'Refund',
  reverse_payment: 'Reverse M-Pesa payment',
  record_refund: 'Record refund',
};

class VendingSaleReviewService {
  /** Every sale waiting on a person, oldest first within each state — the oldest wait is the one a customer is most annoyed about. */
  async listNeedingAttention(businessId: string, limitPerStatus = 100): Promise<Record<NeedsAttentionStatus, SaleReviewRow[]>> {
    const pages = await Promise.all(NEEDS_ATTENTION_STATUSES.map((status) => machineTransactionRepository.listByBusiness(businessId, { status, limit: limitPerStatus })));
    const machineIds = [...new Set(pages.flatMap((page) => page.transactions.map(({ data }) => data.machineId)))];
    const codes = await this.machineCodes(businessId, machineIds);
    const result = {} as Record<NeedsAttentionStatus, SaleReviewRow[]>;
    NEEDS_ATTENTION_STATUSES.forEach((status, index) => {
      result[status] = pages[index].transactions
        .map(({ id, data }) => ({ id, sale: data, machineCode: codes.get(data.machineId) ?? null }))
        .sort((a, b) => a.sale.updatedAt.toMillis() - b.sale.updatedAt.toMillis());
    });
    return result;
  }

  async getSale(businessId: string, transactionId: string): Promise<SaleReviewDetail> {
    const sale = await machineTransactionRepository.findById(businessId, transactionId);
    if (!sale) {
      throw new SaleReviewError('No sale with that id.', 'not_found');
    }
    const [machine, traces, siblings, refunds, snapshots, history] = await Promise.all([
      machineRepository.findById(businessId, sale.machineId),
      saleTraceService.trace(businessId, { transactionId }),
      this.cartSiblings(businessId, transactionId, sale),
      vendingRefundRepository.listByTransaction(businessId, transactionId),
      cameraService.listSnapshotsByTransaction(businessId, transactionId),
      auditLogRepository.listForEntities(businessId, [transactionId], 50),
    ]);
    return {
      id: transactionId,
      sale,
      machineCode: machine?.machineCode ?? null,
      trace: traces[0] ?? null,
      cartSiblings: siblings,
      refunds,
      snapshots,
      history,
      actions: SALE_REVIEW_ACTIONS.map((action) => this.availability(action, sale, siblings, refunds)),
    };
  }

  /**
   * Carries out one decision. Every check is repeated here against the
   * sale as it is now, whatever the page showed — and each status change
   * is itself a compare-and-set, so two people acting at once can't both
   * succeed.
   */
  async resolve(businessId: string, transactionId: string, input: ResolveInput, actor: string): Promise<ResolveResult> {
    const note = input.note?.trim() ?? '';
    if (note.length < NOTE_MIN || note.length > NOTE_MAX) {
      throw new SaleReviewError(`Write what you checked and why (${NOTE_MIN}–${NOTE_MAX} characters).`, 'invalid');
    }
    const sale = await machineTransactionRepository.findById(businessId, transactionId);
    if (!sale) {
      throw new SaleReviewError('No sale with that id.', 'not_found');
    }
    const [siblings, refunds] = await Promise.all([this.cartSiblings(businessId, transactionId, sale), vendingRefundRepository.listByTransaction(businessId, transactionId)]);
    const availability = this.availability(input.action, sale, siblings, refunds);
    if (!availability.allowed) {
      throw new SaleReviewError(availability.reason ?? `${ACTION_LABEL[input.action]} isn't possible for this sale.`, 'conflict');
    }

    try {
      switch (input.action) {
        case 'confirm_delivered':
          await machineTransactionService.confirmDeliveredAfterReview(businessId, transactionId, actor);
          return { status: 'dispensed', message: 'Marked as delivered. The sale now counts as revenue and one item has left the slot.' };
        case 'start_refund':
          await machineTransactionService.requestRefund(businessId, transactionId);
          return { status: 'refund_requested', message: `Refund of KES ${sale.amountKes} recorded as owed. Now send it.` };
        case 'reverse_payment':
          return await this.reversePayment(businessId, transactionId, sale, note, actor);
        case 'record_refund':
          return await this.recordRefund(businessId, transactionId, sale, refunds, note, input.reference ?? null, actor);
      }
    } catch (error) {
      if (error instanceof VendingRefundInFlightError) {
        throw new SaleReviewError('A refund for this sale is already under way or done. Refresh to see it.', 'conflict');
      }
      if (error instanceof Error && error.name === 'IllegalTransactionTransitionError') {
        throw new SaleReviewError('This sale changed while you were looking at it. Refresh and check again.', 'conflict');
      }
      throw error;
    }
  }

  /**
   * Safaricom's answer to a reversal this service sent. Called from the
   * shared Daraja reversal result handler once it has recorded the
   * callback (so a redelivered callback never runs this twice).
   */
  async applyReversalResult(
    businessId: string,
    match: { id: string; data: VendingRefund },
    result: { succeeded: boolean; transactionId?: string | null; resultDesc?: string | null },
  ): Promise<void> {
    if (result.succeeded) {
      await vendingRefundRepository.applyTransition(
        match.id,
        { status: 'succeeded', reversalTransactionId: result.transactionId ?? null, completedAt: new Date() as unknown as VendingRefund['completedAt'] },
        vendingRefundAuditEntry('reversal_confirmed', 'system', result.transactionId ?? undefined),
        'system',
      );
      try {
        await machineTransactionService.markRefunded(businessId, match.data.transactionId);
      } catch (error) {
        // The money is back with the customer either way; the sale's status is repairable by recording the refund.
        logger.error('vending reversal confirmed but the sale could not be marked refunded', { businessId, transactionId: match.data.transactionId, refundId: match.id, error });
      }
    } else {
      await vendingRefundRepository.applyTransition(match.id, { status: 'failed' }, vendingRefundAuditEntry('reversal_failed', 'system', result.resultDesc ?? undefined), 'system');
    }
  }

  private async reversePayment(businessId: string, transactionId: string, sale: MachineTransaction, note: string, actor: string): Promise<ResolveResult> {
    const refundId = await vendingRefundRepository.createIfNoneInFlight(
      {
        businessId,
        transactionId,
        machineId: sale.machineId,
        amountKes: sale.amountKes,
        method: 'mpesa_reversal',
        status: 'pending',
        note,
        requestedBy: actor,
        originalMpesaReceiptNumber: sale.paymentRef,
        reversalOriginatorConversationId: null,
        reversalConversationId: null,
        reversalTransactionId: null,
        externalReference: null,
        completedAt: null,
      },
      vendingRefundAuditEntry('reversal_requested', actor, note),
      actor,
    );
    try {
      const reversal = await darajaGateway.initiateReversal({
        businessId,
        transactionId: sale.paymentRef as string,
        amountKes: sale.amountKes,
        remarks: 'Snack Quest machine refund',
        occasion: sale.transactionRef,
      });
      await vendingRefundRepository.applyTransition(
        refundId,
        { status: 'processing', reversalOriginatorConversationId: reversal.originatorConversationId, reversalConversationId: reversal.conversationId },
        vendingRefundAuditEntry('reversal_accepted', actor, reversal.originatorConversationId),
        actor,
      );
      return { status: 'refund_requested', refundStatus: 'processing', message: 'Safaricom accepted the reversal. The sale is marked refunded once Safaricom confirms it — usually within minutes.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      await vendingRefundRepository.applyTransition(refundId, { status: 'failed' }, vendingRefundAuditEntry('reversal_initiation_failed', actor, message), actor);
      return { status: 'refund_requested', refundStatus: 'failed', message: `Safaricom did not accept the reversal: ${message}. Nothing was sent. Try again, or send the money another way and record it.` };
    }
  }

  private async recordRefund(
    businessId: string,
    transactionId: string,
    sale: MachineTransaction,
    refunds: { id: string; data: VendingRefund }[],
    note: string,
    reference: string | null,
    actor: string,
  ): Promise<ResolveResult> {
    // A refund already confirmed (e.g. a reversal whose status update was lost): just bring the sale in line.
    if (refunds.some(({ data }) => data.status === 'succeeded')) {
      await machineTransactionService.markRefunded(businessId, transactionId);
      return { status: 'refunded', message: 'This refund was already confirmed; the sale is now marked refunded.' };
    }
    const code = reference?.trim() ?? '';
    if (!REFERENCE_PATTERN.test(code)) {
      throw new SaleReviewError('Enter the confirmation code of the money you sent (for M-Pesa, the 10-character code on the message).', 'invalid');
    }
    await vendingRefundRepository.createIfNoneInFlight(
      {
        businessId,
        transactionId,
        machineId: sale.machineId,
        amountKes: sale.amountKes,
        method: 'recorded',
        status: 'succeeded',
        note,
        requestedBy: actor,
        originalMpesaReceiptNumber: sale.paymentRef,
        reversalOriginatorConversationId: null,
        reversalConversationId: null,
        reversalTransactionId: null,
        externalReference: code.toUpperCase(),
        completedAt: new Date() as unknown as VendingRefund['completedAt'],
      },
      vendingRefundAuditEntry('refund_recorded', actor, `${code.toUpperCase()} — ${note}`),
      actor,
      { pendingStaleAfterMs: PENDING_REVERSAL_STALE_MS },
    );
    await machineTransactionService.markRefunded(businessId, transactionId);
    return { status: 'refunded', message: `Recorded. The sale is marked refunded (KES ${sale.amountKes}, ${code.toUpperCase()}).` };
  }

  /** Whether an action can be taken now, and if not, why — the same answer the page shows and `resolve` enforces. */
  availability(
    action: SaleReviewAction,
    sale: MachineTransaction,
    siblings: { id: string; sale: MachineTransaction }[],
    refunds: { id: string; data: VendingRefund }[],
    now = Date.now(),
  ): ActionAvailability {
    const no = (reason: string): ActionAvailability => ({ action, allowed: false, reason });
    const yes: ActionAvailability = { action, allowed: true, reason: null };
    const customer = isCustomerSale(sale);

    switch (action) {
      case 'confirm_delivered':
        return sale.status === 'manual_review' ? yes : no('Only a sale under review can be confirmed by hand.');
      case 'start_refund':
        if (!customer) return no('This was a staff test vend — nobody paid, so nothing is owed.');
        return sale.status === 'manual_review' || sale.status === 'paid_vend_failed' ? yes : no(sale.status === 'refund_requested' ? 'A refund is already owed — send it below.' : 'Nothing is owed on this sale.');
    }

    if (sale.status !== 'refund_requested') {
      return no(sale.status === 'refunded' ? 'Already refunded.' : 'Mark the refund as owed first.');
    }
    const processing = refunds.find(({ data }) => data.status === 'processing');
    if (processing) {
      return no('A reversal is with Safaricom. Wait for its answer before doing anything else.');
    }
    const pending = refunds.find(({ data }) => data.status === 'pending');

    if (action === 'reverse_payment') {
      if (pending) return no('A reversal was started but Safaricom never confirmed receiving it. Check the M-Pesa statement, then record the refund.');
      if (sale.paymentMethod !== 'mpesa') return no('This sale was not paid by M-Pesa.');
      if (!sale.paymentRef) return no('This sale has no M-Pesa receipt to reverse.');
      if (siblings.length > 0) {
        return no(`This M-Pesa payment also paid for ${siblings.length} other item${siblings.length === 1 ? '' : 's'}. A reversal would return the whole payment — send KES ${sale.amountKes} another way and record it.`);
      }
      return yes;
    }

    // record_refund
    if (pending && now - (pending.data.createdAt?.toMillis?.() ?? now) < PENDING_REVERSAL_STALE_MS) {
      return no('A reversal is being sent right now. Give it a few minutes.');
    }
    return yes;
  }

  private async cartSiblings(businessId: string, transactionId: string, sale: MachineTransaction): Promise<{ id: string; sale: MachineTransaction }[]> {
    if (!sale.checkoutRequestId) {
      return [];
    }
    const cart = await machineTransactionRepository.listByCheckoutRequestId(businessId, sale.checkoutRequestId);
    return cart.filter(({ id }) => id !== transactionId).map(({ id, data }) => ({ id, sale: data }));
  }

  private async machineCodes(businessId: string, machineIds: string[]): Promise<Map<string, string>> {
    const machines = await Promise.all(machineIds.map((id) => machineRepository.findById(businessId, id)));
    const codes = new Map<string, string>();
    machineIds.forEach((id, index) => {
      const machine = machines[index];
      if (machine) codes.set(id, machine.machineCode);
    });
    return codes;
  }
}

export const vendingSaleReviewService = new VendingSaleReviewService();
export { VendingSaleReviewService };
