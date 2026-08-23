import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminFirestore } from '@/lib/firebase/admin';
import { paymentIntentRepository } from '@/repositories/paymentIntentRepository';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';

const { queryStkStatusMock } = vi.hoisted(() => ({ queryStkStatusMock: vi.fn() }));

vi.mock('@/lib/integrations/daraja/darajaGateway', () => ({
  darajaGateway: { queryStkStatus: queryStkStatusMock },
}));

import { paymentService } from '@/services/paymentService';

const BUSINESS_ID = 'biz-stk-reconciliation-test';

async function seedStuckIntent(): Promise<{ intentId: string; checkoutRequestId: string }> {
  const intentId = await paymentIntentRepository.create({
    businessId: BUSINESS_ID,
    conversationId: 'conv-1',
    conversationCheckoutSnapshotId: 'snapshot-1',
    customerId: null,
    phoneNumber: '254700000000',
    amountKes: 2500,
  });
  const checkoutRequestId = `ws_CO_${intentId}`;
  await paymentIntentRepository.addAttempt(intentId, {
    checkoutRequestId,
    merchantRequestId: `merchant_${intentId}`,
    status: 'initiated',
    resultCode: null,
    resultDesc: null,
    mpesaReceiptNumber: null,
  });
  await paymentIntentRepository.updateStatus(intentId, 'processing');
  return { intentId, checkoutRequestId };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await adminFirestore.recursiveDelete(adminFirestore.collection('paymentIntents'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('webhookEvents'));
});

describe('PaymentService.reconcileStuckIntents', () => {
  it('ignores an intent that is not old enough to count as stuck yet', async () => {
    await seedStuckIntent();

    const outcomes = await paymentService.reconcileStuckIntents(BUSINESS_ID, {
      stuckAfterMs: 999_999_999,
    });

    expect(outcomes).toHaveLength(0);
    expect(queryStkStatusMock).not.toHaveBeenCalled();
  });

  it('auto-resolves a definitively failed payment and returns a failed callback result', async () => {
    const { intentId, checkoutRequestId } = await seedStuckIntent();
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId,
      responseCode: '0',
      responseDescription: 'The service request has been accepted successfully',
      resultCode: 1032,
      resultDesc: 'Request cancelled by user.',
    });

    const outcomes = await paymentService.reconcileStuckIntents(BUSINESS_ID, { stuckAfterMs: 0 });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      intentId,
      checkoutRequestId,
      outcome: 'confirmedFailed',
      callbackResult: { status: 'failed', intentId, reason: 'Request cancelled by user.' },
    });

    const intent = await paymentIntentRepository.findById(intentId);
    expect(intent?.status).toBe('failed');
  });

  it('never fabricates a receipt number for a confirmed success — flags for manual review instead', async () => {
    const { intentId, checkoutRequestId } = await seedStuckIntent();
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId,
      responseCode: '0',
      responseDescription: 'The service request has been accepted successfully',
      resultCode: 0,
      resultDesc: 'The service request is processed successfully.',
    });

    const outcomes = await paymentService.reconcileStuckIntents(BUSINESS_ID, { stuckAfterMs: 0 });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcome).toBe('needsManualReview');
    expect(outcomes[0].callbackResult).toBeUndefined();
    expect(outcomes[0].reviewReason).toMatch(/no M-Pesa receipt number/);

    // Intent is left untouched (still 'processing') so a late real callback can still complete it.
    const intent = await paymentIntentRepository.findById(intentId);
    expect(intent?.status).toBe('processing');
  });

  it('does not re-query or re-notify on every sweep once a success-without-receipt is already flagged', async () => {
    const { intentId, checkoutRequestId } = await seedStuckIntent();
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId,
      responseCode: '0',
      responseDescription: 'ok',
      resultCode: 0,
      resultDesc: 'The service request is processed successfully.',
    });

    const first = await paymentService.reconcileStuckIntents(BUSINESS_ID, { stuckAfterMs: 0 });
    expect(queryStkStatusMock).toHaveBeenCalledTimes(1);

    const second = await paymentService.reconcileStuckIntents(BUSINESS_ID, { stuckAfterMs: 0 });

    expect(first).toHaveLength(1);
    expect(first[0].outcome).toBe('needsManualReview');
    // Second sweep sees it's already flagged — skipped without a second Daraja call or a second notification.
    expect(second).toEqual([{ intentId, checkoutRequestId, outcome: 'skipped' }]);
    expect(queryStkStatusMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the real callback path free to complete a payment its own idempotency flag never touched', async () => {
    const { checkoutRequestId } = await seedStuckIntent();
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId,
      responseCode: '0',
      responseDescription: 'ok',
      resultCode: 0,
      resultDesc: 'The service request is processed successfully.',
    });

    await paymentService.reconcileStuckIntents(BUSINESS_ID, { stuckAfterMs: 0 });

    // The real callback's own idempotency slot (eventKind 'stk_callback', providerEventId ===
    // the bare checkoutRequestId) must still be free — the reconciliation flag used a distinct id.
    const idempotency = await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'daraja',
      eventKind: 'stk_callback',
      providerEventId: checkoutRequestId,
      payload: {},
    });
    expect(idempotency.isNew).toBe(true);
  });

  it('marks an intent expired once it has been inconclusive past the expiry ceiling', async () => {
    const { intentId, checkoutRequestId } = await seedStuckIntent();
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId,
      responseCode: '500.001.1001',
      responseDescription: 'Transaction is being processed',
      resultCode: 0,
      resultDesc: '',
    });

    const outcomes = await paymentService.reconcileStuckIntents(BUSINESS_ID, {
      stuckAfterMs: 0,
      expireAfterMs: 0,
    });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcome).toBe('needsManualReview');
    expect(outcomes[0].reviewReason).toMatch(/expired/i);

    const intent = await paymentIntentRepository.findById(intentId);
    expect(intent?.status).toBe('expired');
  });

  it('leaves a genuinely inconclusive, not-yet-expired intent alone as stillPending', async () => {
    await seedStuckIntent();
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId: 'irrelevant',
      responseCode: '500.001.1001',
      responseDescription: 'Transaction is being processed',
      resultCode: 0,
      resultDesc: '',
    });

    const outcomes = await paymentService.reconcileStuckIntents(BUSINESS_ID, {
      stuckAfterMs: 0,
      expireAfterMs: 999_999_999,
    });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcome).toBe('stillPending');
  });

  it('increments queryAttemptCount on every genuine query, so the retry budget actually shrinks', async () => {
    const { intentId, checkoutRequestId } = await seedStuckIntent();
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId,
      responseCode: '500.001.1001',
      responseDescription: 'Transaction is being processed',
      resultCode: 0,
      resultDesc: '',
    });

    await paymentService.reconcileStuckIntents(BUSINESS_ID, { stuckAfterMs: 0, expireAfterMs: 999_999_999 });
    let pending = await paymentIntentRepository.getPendingAttempt(intentId);
    expect(pending?.queryAttemptCount).toBe(1);

    await paymentService.reconcileStuckIntents(BUSINESS_ID, { stuckAfterMs: 0, expireAfterMs: 999_999_999 });
    pending = await paymentIntentRepository.getPendingAttempt(intentId);
    expect(pending?.queryAttemptCount).toBe(2);
  });

  it('gives up after maxQueryAttempts inconclusive queries, even with a distant expiry ceiling', async () => {
    const { intentId, checkoutRequestId } = await seedStuckIntent();
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId,
      responseCode: '500.001.1001',
      responseDescription: 'Transaction is being processed',
      resultCode: 0,
      resultDesc: '',
    });

    const outcomes = await paymentService.reconcileStuckIntents(BUSINESS_ID, {
      stuckAfterMs: 0,
      expireAfterMs: 999_999_999,
      maxQueryAttempts: 1,
    });

    expect(queryStkStatusMock).toHaveBeenCalledTimes(1);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].outcome).toBe('needsManualReview');
    expect(outcomes[0].reviewReason).toMatch(/1 status checks/);

    const intent = await paymentIntentRepository.findById(intentId);
    expect(intent?.status).toBe('expired');
  });

  it('gives up on an already-exhausted attempt without querying Daraja again (recovers from a prior partial failure)', async () => {
    const { intentId, checkoutRequestId } = await seedStuckIntent();
    const pending = await paymentIntentRepository.getPendingAttempt(intentId);
    // Simulate a prior sweep run that queried up to the cap but crashed before
    // marking the intent expired (e.g. the process died between the count
    // increment and the status update) — the count is already at the ceiling
    // while the intent is still 'processing'.
    await paymentIntentRepository.incrementQueryAttemptCount(intentId, pending!.attemptId);
    await paymentIntentRepository.incrementQueryAttemptCount(intentId, pending!.attemptId);

    const outcomes = await paymentService.reconcileStuckIntents(BUSINESS_ID, {
      stuckAfterMs: 0,
      expireAfterMs: 999_999_999,
      maxQueryAttempts: 2,
    });

    expect(queryStkStatusMock).not.toHaveBeenCalled();
    expect(outcomes).toEqual([
      {
        intentId,
        checkoutRequestId,
        outcome: 'needsManualReview',
        reviewReason: expect.stringContaining('queried 2 times'),
      },
    ]);

    const intent = await paymentIntentRepository.findById(intentId);
    expect(intent?.status).toBe('expired');
  });

  it('skips an intent whose attempt already resolved (a real callback won the race)', async () => {
    const { intentId } = await seedStuckIntent();
    const pending = await paymentIntentRepository.getPendingAttempt(intentId);
    await paymentIntentRepository.resolveAttempt(intentId, pending!.attemptId, {
      status: 'succeeded',
      resultCode: 0,
      resultDesc: 'ok',
      mpesaReceiptNumber: 'NLJ7RT61SV',
    });
    await paymentIntentRepository.updateStatus(intentId, 'succeeded');

    // Force it back to 'processing' at the top-level status only (simulating a narrow race
    // window) is unnecessary — listByStatus(['processing']) simply won't return it anymore,
    // which is the real behavior being verified here.
    const outcomes = await paymentService.reconcileStuckIntents(BUSINESS_ID, { stuckAfterMs: 0 });

    expect(outcomes).toHaveLength(0);
    expect(queryStkStatusMock).not.toHaveBeenCalled();
  });
});

/**
 * The path that stops a paid customer from being left with nothing
 * when Safaricom never calls back (§ payment auto-recovery) — the
 * failure actually observed in production.
 */
describe('PaymentService.recoverProcessingPayment', () => {
  const CONVERSATION_ID = 'conv-1';

  it('settles a payment Safaricom confirms, without inventing a receipt', async () => {
    const { intentId, checkoutRequestId } = await seedStuckIntent();
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId,
      responseCode: '0',
      responseDescription: 'ok',
      resultCode: 0,
      resultDesc: 'The service request is processed successfully.',
    });

    const result = await paymentService.recoverProcessingPayment(BUSINESS_ID, CONVERSATION_ID, {
      stuckAfterMs: 0,
    });

    expect(result).toMatchObject({
      status: 'succeeded',
      intentId,
      conversationId: CONVERSATION_ID,
      snapshotId: 'snapshot-1',
      amountKes: 2500,
      // Never fabricated — the query API returns no receipt.
      mpesaReceiptNumber: '',
    });
    expect((await paymentIntentRepository.findById(intentId))?.status).toBe('succeeded');
  });

  it('leaves a payment alone while the customer could still be typing their PIN', async () => {
    await seedStuckIntent();

    const result = await paymentService.recoverProcessingPayment(BUSINESS_ID, CONVERSATION_ID);

    expect(result).toBeNull();
    expect(queryStkStatusMock).not.toHaveBeenCalled();
  });

  it('reports a definitive failure rather than settling it as paid', async () => {
    const { checkoutRequestId } = await seedStuckIntent();
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId,
      responseCode: '0',
      responseDescription: 'ok',
      resultCode: 1032,
      resultDesc: 'Request cancelled by user',
    });

    const result = await paymentService.recoverProcessingPayment(BUSINESS_ID, CONVERSATION_ID, {
      stuckAfterMs: 0,
    });

    expect(result).toMatchObject({ status: 'failed', reason: 'Request cancelled by user' });
  });

  /**
   * The risk this whole path introduces: two independent things now
   * believe they can settle one payment. A real callback that arrives
   * late must not produce a second order.
   */
  it('refuses to settle a payment the real callback already claimed', async () => {
    const { intentId, checkoutRequestId } = await seedStuckIntent();
    await webhookEventRepository.recordIfNew({
      businessId: BUSINESS_ID,
      provider: 'daraja',
      eventKind: 'stk_callback',
      providerEventId: checkoutRequestId,
      payload: { source: 'the real callback' },
      relatedEntityId: intentId,
    });
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId,
      responseCode: '0',
      responseDescription: 'ok',
      resultCode: 0,
      resultDesc: 'ok',
    });

    const result = await paymentService.recoverProcessingPayment(BUSINESS_ID, CONVERSATION_ID, {
      stuckAfterMs: 0,
    });

    expect(result).toBeNull();
  });

  /**
   * The customer who approved the M-Pesa prompt and closed the tab.
   * Nothing is polling for them, so the sweep is the only thing that
   * will ever turn their payment into an order.
   */
  it('recovers a payment nobody is watching, via the sweep', async () => {
    const { intentId, checkoutRequestId } = await seedStuckIntent();
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId,
      responseCode: '0',
      responseDescription: 'ok',
      resultCode: 0,
      resultDesc: 'ok',
    });

    const results = await paymentService.recoverAllProcessingPayments(BUSINESS_ID, {
      stuckAfterMs: 0,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: 'succeeded', intentId, mpesaReceiptNumber: '' });
    expect((await paymentIntentRepository.findById(intentId))?.status).toBe('succeeded');
  });

  it('does nothing for a checkout session with no payment in flight', async () => {
    const result = await paymentService.recoverProcessingPayment(BUSINESS_ID, 'conv-does-not-exist', {
      stuckAfterMs: 0,
    });

    expect(result).toBeNull();
    expect(queryStkStatusMock).not.toHaveBeenCalled();
  });

  it('stops querying once the retry budget for the attempt is spent', async () => {
    const { intentId } = await seedStuckIntent();
    const pending = await paymentIntentRepository.getPendingAttempt(intentId);
    for (let i = 0; i < 5; i += 1) {
      await paymentIntentRepository.incrementQueryAttemptCount(intentId, pending!.attemptId);
    }

    const result = await paymentService.recoverProcessingPayment(BUSINESS_ID, CONVERSATION_ID, {
      stuckAfterMs: 0,
    });

    expect(result).toBeNull();
    expect(queryStkStatusMock).not.toHaveBeenCalled();
  });
});

/**
 * The action `needsManualReview`'s own review reason names but never
 * had a way to actually do: Daraja confirms success, no callback ever
 * arrived, and a human reads the real receipt off the M-Pesa statement.
 */
describe('PaymentService.completeManually', () => {
  it('settles a processing intent and resolves its dangling attempt', async () => {
    const { intentId } = await seedStuckIntent();

    const outcome = await paymentService.completeManually({
      businessId: BUSINESS_ID,
      intentId,
      mpesaReceiptNumber: 'QGH7ABC123',
      recordedByUid: 'admin-1',
      recordedByName: 'Kelvin',
      note: null,
    });

    expect(outcome.settled).toBe(true);
    expect(outcome.result).toMatchObject({
      status: 'succeeded',
      intentId,
      conversationId: 'conv-1',
      snapshotId: 'snapshot-1',
      amountKes: 2500,
      mpesaReceiptNumber: 'QGH7ABC123',
    });
    expect(outcome.result?.manualPayment).toMatchObject({
      method: 'mpesa_manual',
      reference: 'QGH7ABC123',
      recordedByUid: 'admin-1',
      recordedByName: 'Kelvin',
    });

    const intent = await paymentIntentRepository.findById(intentId);
    expect(intent?.status).toBe('succeeded');

    const pending = await paymentIntentRepository.getPendingAttempt(intentId);
    expect(pending).toBeNull(); // no longer 'initiated' — it was resolved
  });

  it('refuses an intent that never went through a real STK attempt', async () => {
    const intentId = await paymentIntentRepository.create({
      businessId: BUSINESS_ID,
      conversationId: 'conv-2',
      conversationCheckoutSnapshotId: 'snapshot-2',
      customerId: null,
      phoneNumber: '254700000001',
      amountKes: 1000,
    });

    const outcome = await paymentService.completeManually({
      businessId: BUSINESS_ID,
      intentId,
      mpesaReceiptNumber: 'QGH7XYZ999',
      recordedByUid: 'admin-1',
      recordedByName: 'Kelvin',
      note: null,
    });

    expect(outcome.settled).toBe(false);
    expect(outcome.reason).toMatch(/already pending/);
  });

  it('refuses an intent already resolved, so a real callback and this can never both win', async () => {
    const { intentId } = await seedStuckIntent();
    await paymentIntentRepository.updateStatus(intentId, 'succeeded');

    const outcome = await paymentService.completeManually({
      businessId: BUSINESS_ID,
      intentId,
      mpesaReceiptNumber: 'QGH7ABC123',
      recordedByUid: 'admin-1',
      recordedByName: 'Kelvin',
      note: null,
    });

    expect(outcome.settled).toBe(false);
  });

  it('never fabricates a receipt when none is given', async () => {
    const { intentId } = await seedStuckIntent();

    const outcome = await paymentService.completeManually({
      businessId: BUSINESS_ID,
      intentId,
      mpesaReceiptNumber: '   ',
      recordedByUid: 'admin-1',
      recordedByName: 'Kelvin',
      note: null,
    });

    expect(outcome.settled).toBe(false);
    const intent = await paymentIntentRepository.findById(intentId);
    expect(intent?.status).toBe('processing');
  });
});
