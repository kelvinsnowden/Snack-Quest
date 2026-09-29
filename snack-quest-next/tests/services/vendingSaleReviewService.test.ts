import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { machineService } from '@/services/machineService';
import { MachineSlotService } from '@/services/machineSlotService';
import { MachineTransactionService } from '@/services/machineTransactionService';
import { machineTransactionRepository } from '@/repositories/machineTransactionRepository';
import { vendingRefundRepository, vendingRefundAuditEntry } from '@/repositories/vendingRefundRepository';
import { vendingSaleReviewService, SaleReviewError, PENDING_REVERSAL_STALE_MS } from '@/services/vendingSaleReviewService';
import { refundService } from '@/services/refundService';
import { darajaGateway } from '@/lib/integrations/daraja/darajaGateway';
import { MockVendingAdapter } from '@/lib/vending/adapters/mockVendingAdapter';
import type { MachineTransactionStatus } from '@/types';

/**
 * The human end of the dispense-safety design. What matters:
 * - a sale nobody could decide on can be confirmed delivered (revenue,
 *   one stock movement) or refunded — and only from the states where that
 *   makes sense, with a written reason;
 * - the customer's money goes back at most once, however many people
 *   press the button and however often Safaricom calls back;
 * - an M-Pesa reversal is only offered when the sale was the only item on
 *   that payment — never assumed to work for part of a cart;
 * - a reversal whose fate is unknown is never retried automatically;
 * - one business can never see or act on another's sales.
 */

const BUSINESS_ID = 'biz-sale-review';
const OTHER_BUSINESS_ID = 'biz-sale-review-other';
const COLLECTIONS = ['machines', 'machineSlots', 'machineTransactions', 'machineInventoryMovements', 'vendingRefunds', 'deviceCredentials', 'webhookEvents', 'machineDispenseCommands', 'machineEvents', 'auditLogs'];

async function clean() {
  for (const businessId of [BUSINESS_ID, OTHER_BUSINESS_ID]) {
    for (const collection of COLLECTIONS) {
      const snapshot = await adminFirestore.collection(collection).where('businessId', '==', businessId).get();
      await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
    }
  }
}

beforeEach(clean);
afterEach(async () => {
  vi.restoreAllMocks();
  await clean();
});

let sequence = 0;

/** A machine with slot A01 holding 5 units, and a paid sale on it moved to `status`. */
async function paidSale(status: MachineTransactionStatus, options: { businessId?: string; checkoutRequestId?: string; machineId?: string; diagnostic?: boolean } = {}) {
  const businessId = options.businessId ?? BUSINESS_ID;
  sequence += 1;
  let machineId = options.machineId;
  const adapter = new MockVendingAdapter();
  if (!machineId) {
    ({ machineId } = await machineService.provisionDevice({ businessId, machineCode: `SQ-REVIEW-${sequence}-${Date.now()}`, serialNumber: `SN-${sequence}`, manufacturer: 'mock', model: 'test', actor: 'staff-1' }));
    const slots = new MachineSlotService(() => adapter);
    adapter.seedSlot(machineId, 'A01', { quantity: 5 });
    await slots.configureSlot({ businessId, machineId, slotCode: 'A01', productId: 'snack-1', productCatalogue: 'snackItem', priceKes: 250, capacity: 10, position: 1 });
    await adminFirestore.collection('machineSlots').doc(`${machineId}__A01`).update({ currentQuantity: 5 });
  }
  const transactions = new MachineTransactionService(() => adapter);
  const { id } = await transactions.createPending({ businessId, machineId, slotId: 'A01', paymentMethod: options.diagnostic ? 'diagnostic' : 'mpesa' });
  if (options.checkoutRequestId) {
    await machineTransactionRepository.setCheckoutRequest(businessId, id, { checkoutRequestId: options.checkoutRequestId, merchantRequestId: `m-${options.checkoutRequestId}` });
  }
  await transactions.markPaymentVerified(businessId, id, options.diagnostic ? 'DIAGNOSTIC:staff-1' : `RCP${sequence}X${Date.now() % 100000}`);
  if (status === 'manual_review' || status === 'paid_vend_failed' || status === 'refund_requested') {
    await machineTransactionRepository.moveStatus(businessId, id, status === 'refund_requested' ? 'paid_vend_failed' : status, { failureReason: 'test setup' });
  }
  if (status === 'refund_requested') {
    await machineTransactionRepository.moveStatus(businessId, id, 'refund_requested');
  }
  return { id, machineId: machineId as string };
}

const saleMovements = async (transactionId: string) =>
  (await adminFirestore.collection('machineInventoryMovements').where('businessId', '==', BUSINESS_ID).where('sourceTransactionId', '==', transactionId).get()).size;

const statusOf = async (id: string, businessId = BUSINESS_ID) => (await machineTransactionRepository.findById(businessId, id))?.status;

function stubReversal(originatorConversationId = `orig-${Date.now()}`) {
  return vi.spyOn(darajaGateway, 'initiateReversal').mockResolvedValue({ originatorConversationId, conversationId: `conv-${originatorConversationId}`, responseCode: '0', responseDescription: 'Accepted' } as Awaited<ReturnType<typeof darajaGateway.initiateReversal>>);
}

const reversalResult = (originatorConversationId: string, succeeded: boolean) => ({
  Result: succeeded
    ? { ResultType: 0, ResultCode: 0, ResultDesc: 'Success', OriginatorConversationID: originatorConversationId, ConversationID: 'conv', TransactionID: 'RVX123ABC', ResultParameters: { ResultParameter: [{ Key: 'Amount', Value: 250 }] } }
    : { ResultType: 0, ResultCode: 2001, ResultDesc: 'The initiator information is invalid.', OriginatorConversationID: originatorConversationId, ConversationID: 'conv' },
});

describe('confirming a sale under review as delivered', () => {
  it('completes the sale, moves stock exactly once, and cannot be done twice', async () => {
    const { id } = await paidSale('manual_review');
    const result = await vendingSaleReviewService.resolve(BUSINESS_ID, id, { action: 'confirm_delivered', note: 'Slot count dropped by one' }, 'staff-1');
    expect(result.status).toBe('dispensed');
    expect(await statusOf(id)).toBe('dispensed');
    expect(await saleMovements(id)).toBe(1);

    await expect(vendingSaleReviewService.resolve(BUSINESS_ID, id, { action: 'confirm_delivered', note: 'again' }, 'staff-2')).rejects.toMatchObject({ code: 'conflict' });
    expect(await saleMovements(id)).toBe(1);
  });

  it('is refused for a sale the machine said failed, and without a written reason', async () => {
    const failed = await paidSale('paid_vend_failed');
    await expect(vendingSaleReviewService.resolve(BUSINESS_ID, failed.id, { action: 'confirm_delivered', note: 'I think it worked' }, 'staff-1')).rejects.toBeInstanceOf(SaleReviewError);
    expect(await statusOf(failed.id)).toBe('paid_vend_failed');

    const review = await paidSale('manual_review');
    await expect(vendingSaleReviewService.resolve(BUSINESS_ID, review.id, { action: 'confirm_delivered', note: '  ' }, 'staff-1')).rejects.toMatchObject({ code: 'invalid' });
    expect(await statusOf(review.id)).toBe('manual_review');
  });

  it('settles a contradicting machine report once a person decides', async () => {
    const { id } = await paidSale('manual_review');
    await adminFirestore.collection('machineTransactions').doc(id).update({ outcomeConflict: { reportedStatus: 'success', previousStatus: 'refund_requested', reportedAt: Timestamp.now(), source: 'test', resolved: false } });
    await vendingSaleReviewService.resolve(BUSINESS_ID, id, { action: 'confirm_delivered', note: 'Camera shows the bag dropping' }, 'staff-1');
    expect((await machineTransactionRepository.findById(BUSINESS_ID, id))?.outcomeConflict?.resolved).toBe(true);
  });
});

describe('refunding through an M-Pesa reversal', () => {
  it('owed → reversal accepted → Safaricom confirms → refunded; the callback arriving twice changes nothing', async () => {
    const { id } = await paidSale('paid_vend_failed');
    await vendingSaleReviewService.resolve(BUSINESS_ID, id, { action: 'start_refund', note: 'Slot jammed' }, 'staff-1');
    expect(await statusOf(id)).toBe('refund_requested');

    const reversal = stubReversal('orig-happy');
    const sent = await vendingSaleReviewService.resolve(BUSINESS_ID, id, { action: 'reverse_payment', note: 'Customer called' }, 'staff-1');
    expect(sent.refundStatus).toBe('processing');
    expect(reversal).toHaveBeenCalledTimes(1);
    expect(reversal.mock.calls[0][0]).toMatchObject({ businessId: BUSINESS_ID, amountKes: 250 });
    expect(await statusOf(id)).toBe('refund_requested');

    await refundService.handleReversalResult(BUSINESS_ID, reversalResult('orig-happy', true));
    await refundService.handleReversalResult(BUSINESS_ID, reversalResult('orig-happy', true));
    expect(await statusOf(id)).toBe('refunded');
    const refunds = await vendingRefundRepository.listByTransaction(BUSINESS_ID, id);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].data).toMatchObject({ method: 'mpesa_reversal', status: 'succeeded', reversalTransactionId: 'RVX123ABC' });

    // Nothing more can be sent for this sale.
    const detail = await vendingSaleReviewService.getSale(BUSINESS_ID, id);
    expect(detail.actions.filter((entry) => entry.allowed)).toEqual([]);
  });

  it('a refused reversal leaves the refund owed and can be tried again', async () => {
    const { id } = await paidSale('refund_requested');
    vi.spyOn(darajaGateway, 'initiateReversal').mockRejectedValueOnce(new Error('Daraja reversal is not configured'));
    const refused = await vendingSaleReviewService.resolve(BUSINESS_ID, id, { action: 'reverse_payment', note: 'First try' }, 'staff-1');
    expect(refused.refundStatus).toBe('failed');
    expect(await statusOf(id)).toBe('refund_requested');

    stubReversal('orig-retry');
    const retried = await vendingSaleReviewService.resolve(BUSINESS_ID, id, { action: 'reverse_payment', note: 'Second try' }, 'staff-1');
    expect(retried.refundStatus).toBe('processing');
  });

  it('a failed reversal result leaves the sale owed', async () => {
    const { id } = await paidSale('refund_requested');
    stubReversal('orig-fails');
    await vendingSaleReviewService.resolve(BUSINESS_ID, id, { action: 'reverse_payment', note: 'Send it' }, 'staff-1');
    await refundService.handleReversalResult(BUSINESS_ID, reversalResult('orig-fails', false));
    expect(await statusOf(id)).toBe('refund_requested');
    expect((await vendingRefundRepository.listByTransaction(BUSINESS_ID, id))[0].data.status).toBe('failed');
  });

  it('two people pressing "Reverse" at once send one reversal', async () => {
    const { id } = await paidSale('refund_requested');
    const reversal = stubReversal('orig-race');
    const results = await Promise.allSettled([
      vendingSaleReviewService.resolve(BUSINESS_ID, id, { action: 'reverse_payment', note: 'Person A' }, 'staff-a'),
      vendingSaleReviewService.resolve(BUSINESS_ID, id, { action: 'reverse_payment', note: 'Person B' }, 'staff-b'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(reversal).toHaveBeenCalledTimes(1);
    expect(await vendingRefundRepository.listByTransaction(BUSINESS_ID, id)).toHaveLength(1);
  });
});

describe('carts and refunds recorded by hand', () => {
  it('never offers a reversal for one item of a multi-item payment; the refund is recorded instead', async () => {
    const first = await paidSale('refund_requested', { checkoutRequestId: 'ws_CO_cart_1' });
    await paidSale('paid', { checkoutRequestId: 'ws_CO_cart_1', machineId: first.machineId });

    const detail = await vendingSaleReviewService.getSale(BUSINESS_ID, first.id);
    expect(detail.cartSiblings).toHaveLength(1);
    const reverse = detail.actions.find((entry) => entry.action === 'reverse_payment');
    expect(reverse?.allowed).toBe(false);
    expect(reverse?.reason).toMatch(/1 other item/);

    const reversal = vi.spyOn(darajaGateway, 'initiateReversal');
    await expect(vendingSaleReviewService.resolve(BUSINESS_ID, first.id, { action: 'reverse_payment', note: 'try anyway' }, 'staff-1')).rejects.toMatchObject({ code: 'conflict' });
    expect(reversal).not.toHaveBeenCalled();

    await expect(vendingSaleReviewService.resolve(BUSINESS_ID, first.id, { action: 'record_refund', note: 'Sent from business app', reference: 'x' }, 'staff-1')).rejects.toMatchObject({ code: 'invalid' });
    const recorded = await vendingSaleReviewService.resolve(BUSINESS_ID, first.id, { action: 'record_refund', note: 'Sent from business app', reference: 'sjk4xy12ab' }, 'staff-1');
    expect(recorded.status).toBe('refunded');
    const [refund] = await vendingRefundRepository.listByTransaction(BUSINESS_ID, first.id);
    expect(refund.data).toMatchObject({ method: 'recorded', status: 'succeeded', externalReference: 'SJK4XY12AB', requestedBy: 'staff-1' });
  });

  it('a reversal nobody heard back about blocks another reversal, and a recorded refund until it is stale', async () => {
    const { id, machineId } = await paidSale('refund_requested');
    const sale = await machineTransactionRepository.findById(BUSINESS_ID, id);
    await vendingRefundRepository.createIfNoneInFlight(
      { businessId: BUSINESS_ID, transactionId: id, machineId, amountKes: 250, method: 'mpesa_reversal', status: 'pending', note: 'crashed mid-send', requestedBy: 'staff-1', originalMpesaReceiptNumber: sale?.paymentRef ?? null, reversalOriginatorConversationId: null, reversalConversationId: null, reversalTransactionId: null, externalReference: null, completedAt: null },
      vendingRefundAuditEntry('reversal_requested', 'staff-1'),
      'staff-1',
    );
    const refunds = await vendingRefundRepository.listByTransaction(BUSINESS_ID, id);
    const current = await machineTransactionRepository.findById(BUSINESS_ID, id);
    const created = refunds[0].data.createdAt.toMillis();

    const fresh = (action: 'reverse_payment' | 'record_refund') => vendingSaleReviewService.availability(action, current!, [], refunds, created + 60_000);
    const stale = (action: 'reverse_payment' | 'record_refund') => vendingSaleReviewService.availability(action, current!, [], refunds, created + PENDING_REVERSAL_STALE_MS + 1);
    expect(fresh('reverse_payment').allowed).toBe(false);
    expect(fresh('record_refund').allowed).toBe(false);
    expect(stale('reverse_payment').allowed).toBe(false);
    expect(stale('record_refund').allowed).toBe(true);

    // The write path enforces the same rule, not just the page.
    await expect(
      vendingRefundRepository.createIfNoneInFlight(
        { businessId: BUSINESS_ID, transactionId: id, machineId, amountKes: 250, method: 'recorded', status: 'succeeded', note: 'x', requestedBy: 'staff-1', originalMpesaReceiptNumber: null, reversalOriginatorConversationId: null, reversalConversationId: null, reversalTransactionId: null, externalReference: 'ABC123DEF4', completedAt: null },
        vendingRefundAuditEntry('refund_recorded', 'staff-1'),
        'staff-1',
        { pendingStaleAfterMs: PENDING_REVERSAL_STALE_MS, now: created + 60_000 },
      ),
    ).rejects.toThrow(/already has a refund/);
  });
});

describe('what is never allowed', () => {
  it('a staff test vend is never refunded', async () => {
    const { id } = await paidSale('manual_review', { diagnostic: true });
    const detail = await vendingSaleReviewService.getSale(BUSINESS_ID, id);
    expect(detail.actions.find((entry) => entry.action === 'start_refund')).toMatchObject({ allowed: false, reason: expect.stringMatching(/test vend/) });
    expect(detail.actions.find((entry) => entry.action === 'confirm_delivered')?.allowed).toBe(true);
    await expect(vendingSaleReviewService.resolve(BUSINESS_ID, id, { action: 'start_refund', note: 'refund it' }, 'staff-1')).rejects.toBeInstanceOf(SaleReviewError);
  });

  it('one business never sees or acts on another business’s sale', async () => {
    const theirs = await paidSale('paid_vend_failed', { businessId: OTHER_BUSINESS_ID });
    await expect(vendingSaleReviewService.getSale(BUSINESS_ID, theirs.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(vendingSaleReviewService.resolve(BUSINESS_ID, theirs.id, { action: 'start_refund', note: 'not mine' }, 'staff-1')).rejects.toMatchObject({ code: 'not_found' });
    expect(await statusOf(theirs.id, OTHER_BUSINESS_ID)).toBe('paid_vend_failed');
    const queue = await vendingSaleReviewService.listNeedingAttention(BUSINESS_ID);
    expect(queue.paid_vend_failed.map((row) => row.id)).not.toContain(theirs.id);
  });

  it('lists every sale waiting on a person, grouped by what it needs', async () => {
    const review = await paidSale('manual_review');
    const owed = await paidSale('paid_vend_failed');
    const toSend = await paidSale('refund_requested');
    const queue = await vendingSaleReviewService.listNeedingAttention(BUSINESS_ID);
    expect(queue.manual_review.map((row) => row.id)).toEqual([review.id]);
    expect(queue.paid_vend_failed.map((row) => row.id)).toEqual([owed.id]);
    expect(queue.refund_requested.map((row) => row.id)).toEqual([toSend.id]);
    expect(queue.manual_review[0].machineCode).toMatch(/^SQ-REVIEW-/);
  });
});
