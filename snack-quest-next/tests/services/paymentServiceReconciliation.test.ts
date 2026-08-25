import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from '@/lib/firebase/admin';
import { paymentIntentRepository } from '@/repositories/paymentIntentRepository';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';

const { queryStkStatusMock } = vi.hoisted(() => ({ queryStkStatusMock: vi.fn() }));

vi.mock('@/lib/integrations/daraja/darajaGateway', () => ({
  darajaGateway: { queryStkStatus: queryStkStatusMock },
}));

import { paymentService } from '@/services/paymentService';

const BUSINESS_ID = 'biz-stk-reconciliation-test';

/**
 * The conversation the recovery reads to find which checkout is the
 * current one. Written at a known id so a test can point it at a
 * specific snapshot.
 */
async function seedConversation(snapshotId: string): Promise<void> {
  await adminFirestore.collection('conversations').doc('conv-1').set({
    businessId: BUSINESS_ID,
    phoneNumber: '254700000000',
    status: 'awaiting_payment',
    currentStep: 'awaiting_payment',
    conversationCheckoutSnapshotId: snapshotId,
    stateBlob: {},
  });
}

async function seedStuckIntent(
  overrides: { snapshotId?: string } = {},
): Promise<{ intentId: string; checkoutRequestId: string }> {
  const intentId = await paymentIntentRepository.create({
    businessId: BUSINESS_ID,
    conversationId: 'conv-1',
    conversationCheckoutSnapshotId: overrides.snapshotId ?? 'snapshot-1',
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
  await adminFirestore.recursiveDelete(adminFirestore.collection('conversations'));
  await adminFirestore.recursiveDelete(adminFirestore.collection('orders'));
  // The default: one conversation whose current checkout is the one
  // `seedStuckIntent` creates. Tests about stale attempts re-point it.
  await seedConversation('snapshot-1');
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
    await paymentIntentRepository.recordQueryAttempt(intentId, pending!.attemptId);
    await paymentIntentRepository.recordQueryAttempt(intentId, pending!.attemptId);

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

  /**
   * The duplicate-order bug this recovery caused in production.
   *
   * A conversation is reused per phone number, and every abandoned
   * checkout deliberately leaves its intent `processing`, so one
   * conversation carries several. Recovery looked one up by
   * conversation, got an arbitrary stale one that had genuinely
   * succeeded at Safaricom without a callback, and completed it — a
   * second order, on its own snapshot, so `completeOrder`'s duplicate
   * guard never recognised the two as the same sale.
   */
  it('recovers only the checkout the customer is on, not an older abandoned one', async () => {
    const stale = await seedStuckIntent({ snapshotId: 'snapshot-abandoned' });
    const current = await seedStuckIntent({ snapshotId: 'snapshot-current' });
    await seedConversation('snapshot-current');
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId: current.checkoutRequestId,
      responseCode: '0',
      responseDescription: 'ok',
      resultCode: 0,
      resultDesc: 'ok',
    });

    const result = await paymentService.recoverProcessingPayment(BUSINESS_ID, CONVERSATION_ID, {
      stuckAfterMs: 0,
    });

    expect(result).toMatchObject({ intentId: current.intentId, snapshotId: 'snapshot-current' });
    // The abandoned attempt is left for a human, exactly as before.
    expect((await paymentIntentRepository.findById(stale.intentId))?.status).toBe('processing');
  });

  /** Backdates the intent so age-based rules can be exercised without waiting. */
  async function ageIntent(intentId: string, ms: number): Promise<void> {
    await adminFirestore
      .collection('paymentIntents')
      .doc(intentId)
      .update({ updatedAt: Timestamp.fromMillis(Date.now() - ms) });
  }

  /**
   * The window used to be two hours against a sweep that runs once a
   * day, so recovery could only ever rescue a payment made in the two
   * hours before it ran. A customer who paid at 3pm and closed the tab
   * was past the ceiling long before the 2am sweep reached them: money
   * taken, no order, straight to manual review.
   */
  it('recovers a payment made earlier the same day', async () => {
    const { intentId } = await seedStuckIntent({ snapshotId: 'snapshot-current' });
    await seedConversation('snapshot-current');
    await ageIntent(intentId, 11 * 60 * 60 * 1000);
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId: `ws_CO_${intentId}`,
      responseCode: '0',
      responseDescription: 'ok',
      resultCode: 0,
      resultDesc: 'ok',
    });

    const result = await paymentService.recoverProcessingPayment(BUSINESS_ID, CONVERSATION_ID, {
      stuckAfterMs: 0,
    });

    expect(result).toMatchObject({ status: 'succeeded', intentId });
    expect((await paymentIntentRepository.findById(intentId))?.status).toBe('succeeded');
  });

  it('refuses to auto-create an order from a payment older than a day', async () => {
    const { intentId } = await seedStuckIntent({ snapshotId: 'snapshot-current' });
    await seedConversation('snapshot-current');
    await ageIntent(intentId, 30 * 60 * 60 * 1000);

    const result = await paymentService.recoverProcessingPayment(BUSINESS_ID, CONVERSATION_ID, {
      stuckAfterMs: 0,
    });

    expect(result).toBeNull();
    expect(queryStkStatusMock).not.toHaveBeenCalled();
    expect((await paymentIntentRepository.findById(intentId))?.status).toBe('processing');
  });

  /**
   * The defect that made the attempt budget useless: the payment
   * screen polls this exact path every three seconds, so five attempts
   * were spent within about fifteen seconds of the first query. Every
   * later recovery — including the sweep that runs after the customer
   * closed the tab, which is the entire reason the sweep exists —
   * found the budget gone and did nothing.
   */
  it('does not re-ask Safaricom on every poll of the payment screen', async () => {
    const { intentId } = await seedStuckIntent({ snapshotId: 'snapshot-current' });
    await seedConversation('snapshot-current');
    // No verdict yet, so the intent stays in flight and can be polled again.
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId: `ws_CO_${intentId}`,
      responseCode: '1',
      responseDescription: 'still processing',
      resultCode: null,
      resultDesc: 'still processing',
    });

    for (let poll = 0; poll < 5; poll += 1) {
      await paymentService.recoverProcessingPayment(BUSINESS_ID, CONVERSATION_ID, { stuckAfterMs: 0 });
    }

    expect(queryStkStatusMock).toHaveBeenCalledTimes(1);
    const pending = await paymentIntentRepository.getPendingAttempt(intentId);
    expect(pending?.queryAttemptCount).toBe(1);
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
    await adminFirestore
      .collection('paymentIntents')
      .doc(intentId)
      .collection('attempts')
      .doc(pending!.attemptId)
      .update({
        queryAttemptCount: 40,
        // Backdated on purpose. `recordQueryAttempt` stamps the time as
        // well as the count, so a budget burned in a loop would leave a
        // just-now timestamp and this would pass on the spacing rule
        // whether the budget was checked or not.
        lastQueriedAt: Timestamp.fromMillis(Date.now() - 60 * 60 * 1000),
      });

    const result = await paymentService.recoverProcessingPayment(BUSINESS_ID, CONVERSATION_ID, {
      stuckAfterMs: 0,
    });

    expect(result).toBeNull();
    expect(queryStkStatusMock).not.toHaveBeenCalled();
  });

  /**
   * Settled either way — an intent left `processing` forever is its
   * own problem — but the customer is not written to about an attempt
   * they walked away from. The nightly sweep would otherwise deliver
   * "reply PAY to try again" at 2am about yesterday's abandoned PIN
   * prompt.
   */
  it('marks a long-abandoned failure stale so the customer is not messaged about it', async () => {
    const { intentId } = await seedStuckIntent({ snapshotId: 'snapshot-current' });
    await seedConversation('snapshot-current');
    await ageIntent(intentId, 5 * 60 * 60 * 1000);
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId: `ws_CO_${intentId}`,
      responseCode: '0',
      responseDescription: 'ok',
      resultCode: 1032,
      resultDesc: 'Request cancelled by user',
    });

    const result = await paymentService.recoverProcessingPayment(BUSINESS_ID, CONVERSATION_ID, {
      stuckAfterMs: 0,
    });

    expect(result).toMatchObject({ status: 'failed', stale: true });
    expect((await paymentIntentRepository.findById(intentId))?.status).toBe('failed');
  });

  it('leaves a failure the customer is still watching un-stale, so they are told', async () => {
    const { intentId } = await seedStuckIntent({ snapshotId: 'snapshot-current' });
    await seedConversation('snapshot-current');
    queryStkStatusMock.mockResolvedValue({
      merchantRequestId: 'merchant-1',
      checkoutRequestId: `ws_CO_${intentId}`,
      responseCode: '0',
      responseDescription: 'ok',
      resultCode: 1032,
      resultDesc: 'Request cancelled by user',
    });

    const result = await paymentService.recoverProcessingPayment(BUSINESS_ID, CONVERSATION_ID, {
      stuckAfterMs: 0,
    });

    expect(result).toMatchObject({ status: 'failed' });
    expect(result && 'stale' in result ? result.stale : undefined).toBeUndefined();
  });
});

/**
 * Fixing a payment somebody typed in wrong (§ correcting a manually
 * recorded payment). It used to be permanent: the only remedies for a
 * mistyped M-Pesa code were leaving it wrong or deleting a real order.
 */
describe('PaymentService.correctManualPayment', () => {
  const ORDER_ID = 'order-manual-1';
  const INTENT_ID = 'intent-manual-1';

  async function seedManualOrder(manualPayment: Record<string, unknown>) {
    await adminFirestore.collection('paymentIntents').doc(INTENT_ID).set({
      businessId: BUSINESS_ID,
      conversationId: 'conv-1',
      conversationCheckoutSnapshotId: 'snapshot-1',
      customerId: null,
      phoneNumber: '254700000000',
      amountKes: 2500,
      status: 'succeeded',
      manualPayment,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    await adminFirestore.collection('orders').doc(ORDER_ID).set({
      businessId: BUSINESS_ID,
      orderNumber: 1,
      status: 'confirmed',
      payment: {
        paymentIntentId: INTENT_ID,
        mpesaReceiptNumber: 'WRONGCODE',
        manualPayment,
      },
      pricing: { totalKes: 2500 },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  const original = {
    method: 'mpesa_manual',
    reference: 'WRONGCODE',
    recordedByUid: 'admin-1',
    recordedByName: 'Kelvin',
    note: null,
    recordedAt: Timestamp.now(),
  };

  it('corrects the reference on both the order and its payment intent', async () => {
    await seedManualOrder(original);

    const outcome = await paymentService.correctManualPayment({
      businessId: BUSINESS_ID,
      orderId: ORDER_ID,
      method: 'mpesa_manual',
      reference: 'QGH7RIGHT01',
      note: 'Typo in the original code',
      correctedByUid: 'admin-2',
      correctedByName: 'Wanjiru',
    });

    expect(outcome.corrected).toBe(true);

    const order = (await adminFirestore.collection('orders').doc(ORDER_ID).get()).data();
    expect(order?.payment.manualPayment.reference).toBe('QGH7RIGHT01');
    // The receipt is the same fact in a second place; leaving it
    // behind is how the books stop reconciling.
    expect(order?.payment.mpesaReceiptNumber).toBe('QGH7RIGHT01');

    const intent = (await adminFirestore.collection('paymentIntents').doc(INTENT_ID).get()).data();
    expect(intent?.manualPayment.reference).toBe('QGH7RIGHT01');
  });

  it('keeps the person who first vouched for the payment, and names the corrector separately', async () => {
    await seedManualOrder(original);

    await paymentService.correctManualPayment({
      businessId: BUSINESS_ID,
      orderId: ORDER_ID,
      method: 'mpesa_manual',
      reference: 'QGH7RIGHT01',
      note: null,
      correctedByUid: 'admin-2',
      correctedByName: 'Wanjiru',
    });

    const order = (await adminFirestore.collection('orders').doc(ORDER_ID).get()).data();
    expect(order?.payment.manualPayment.recordedByName).toBe('Kelvin');
    expect(order?.payment.manualPayment.correctedByName).toBe('Wanjiru');
  });

  it('clears the receipt when the method changes to one that has none', async () => {
    await seedManualOrder(original);

    await paymentService.correctManualPayment({
      businessId: BUSINESS_ID,
      orderId: ORDER_ID,
      method: 'cash',
      reference: null,
      note: null,
      correctedByUid: 'admin-2',
      correctedByName: 'Wanjiru',
    });

    const order = (await adminFirestore.collection('orders').doc(ORDER_ID).get()).data();
    expect(order?.payment.mpesaReceiptNumber).toBeNull();
    expect(order?.payment.manualPayment.method).toBe('cash');
  });

  it('refuses to drop the reference on a method that must have one', async () => {
    await seedManualOrder(original);

    const outcome = await paymentService.correctManualPayment({
      businessId: BUSINESS_ID,
      orderId: ORDER_ID,
      method: 'bank_transfer',
      reference: '   ',
      note: null,
      correctedByUid: 'admin-2',
      correctedByName: 'Wanjiru',
    });

    expect(outcome.corrected).toBe(false);
    expect(outcome.reason).toMatch(/reference is required/);
  });

  /**
   * A Daraja receipt came from Safaricom, not from anybody's typing —
   * there is no human error to correct, and editing it would only make
   * the record less true.
   */
  it('refuses to edit an order M-Pesa settled directly', async () => {
    await adminFirestore.collection('orders').doc(ORDER_ID).set({
      businessId: BUSINESS_ID,
      orderNumber: 2,
      status: 'confirmed',
      payment: { paymentIntentId: INTENT_ID, mpesaReceiptNumber: 'NLJ7RT61SV' },
      pricing: { totalKes: 2500 },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const outcome = await paymentService.correctManualPayment({
      businessId: BUSINESS_ID,
      orderId: ORDER_ID,
      method: 'cash',
      reference: null,
      note: null,
      correctedByUid: 'admin-2',
      correctedByName: 'Wanjiru',
    });

    expect(outcome.corrected).toBe(false);
    expect(outcome.reason).toMatch(/settled by M-Pesa directly/);
  });

  it('refuses an order belonging to another business', async () => {
    await seedManualOrder(original);

    const outcome = await paymentService.correctManualPayment({
      businessId: 'some-other-business',
      orderId: ORDER_ID,
      method: 'cash',
      reference: null,
      note: null,
      correctedByUid: 'admin-2',
      correctedByName: 'Wanjiru',
    });

    expect(outcome.corrected).toBe(false);
    expect(outcome.reason).toBe('Order not found');
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
