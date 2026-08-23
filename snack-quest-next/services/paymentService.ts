import 'server-only';

import { paymentIntentRepository } from '@/repositories/paymentIntentRepository';
import { conversationRepository } from '@/repositories/conversationRepository';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { darajaGateway } from '@/lib/integrations/daraja/darajaGateway';
import { publishEvent } from '@/lib/events/eventBus';
import type { StkPushResult } from '@/lib/integrations/types';
import type { ManualPaymentRecord, PaymentIntent } from '@/types';

/**
 * Owns the payment lifecycle (PLATFORM_ARCHITECTURE_V2.md §7):
 * intent creation, STK push initiation, and callback verification
 * with the 3-part check the doc requires — CheckoutRequestID match
 * (via the attempt lookup), exact amount match, and not-already-
 * processed (via `webhookEventRepository`'s idempotency ledger).
 * `ConversationService`/the Daraja webhook route react to the result;
 * this Service never touches Conversation or Order state directly.
 *
 * `processCallback` also takes `businessId` — resolved by the webhook
 * route from the callback URL's own path (Safaricom requires each
 * shortcode to register its own callback URL, so the URL itself
 * already tells us which tenant this is) — and cross-checks it
 * against the matched intent's own `businessId`. `checkoutRequestId`
 * lookup is a global collection-group query by construction (see
 * `PaymentIntentRepository`), so this check is the one place a
 * cross-tenant mismatch would ever surface.
 */

export interface CreateIntentInput {
  businessId: string;
  conversationId: string;
  conversationCheckoutSnapshotId: string;
  customerId: string | null;
  phoneNumber: string;
  amountKes: number;
}

/**
 * How long a `PaymentIntent` can sit in `'processing'` before the
 * reconciliation sweep (§ Daraja Production Integration Verification
 * Audit §2.4/§7) will even ask Daraja about it. Safaricom's own DS
 * timeout (ResultCode 1037) fires around 60–100s if the customer never
 * responds to the PIN prompt, so querying earlier than that risks
 * asking about a transaction that's still legitimately in progress —
 * 60s is the deliberate default (the top of the 30–60s range this was
 * scoped to), not the bottom, precisely to avoid that false alarm.
 */
const DEFAULT_STUCK_AFTER_MS = 60 * 1000;
/**
 * How many times the sweep will query a single attempt before giving
 * up on it — the actual "sensible retry limit," independent of how
 * long the sweep itself has been running. At the default 5-minute cron
 * cadence, 5 attempts spans ~20 minutes past the initial 60s wait,
 * long enough for Daraja's own processing to settle in every
 * documented case, short enough that a payment isn't silently polled
 * forever.
 */
const DEFAULT_MAX_QUERY_ATTEMPTS = 5;
/**
 * How long the payment screen waits before asking Safaricom directly
 * (§ payment auto-recovery), rather than waiting on a callback that
 * may never arrive. Longer than a fast PIN entry, far shorter than the
 * nightly sweep — a customer sitting on the waiting screen is the
 * whole reason this path exists.
 */
const DEFAULT_RECOVERY_AFTER_MS = 40 * 1000;
/**
 * The ceiling on what recovery will settle by itself (§ payment
 * auto-recovery). Deliberately not open-ended: recovery once picked up
 * a day-old abandoned attempt that had genuinely succeeded at
 * Safaricom, and turned it into a second, surprise order on a
 * conversation that had already moved on. Anything older is a
 * bookkeeping question for a human, not something to auto-create an
 * order from.
 */
const RECOVERY_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/**
 * A time-based backstop *in addition to* the attempt cap above — covers
 * the case where the cron itself runs less often than expected (a
 * deploy issue, a paused schedule) rather than Daraja being slow.
 * Whichever limit is hit first ends the polling loop.
 */
const DEFAULT_EXPIRE_AFTER_MS = 6 * 60 * 60 * 1000;

export interface ReconciliationOutcome {
  intentId: string;
  checkoutRequestId: string;
  /**
   * `confirmedFailed` — Daraja's query definitively says this failed;
   * safe to auto-resolve (a failure carries no financial data to get
   * wrong). `needsManualReview` — either Daraja confirmed *success* but
   * the query response carries no receipt/amount (§2.4 — never
   * fabricate that), or polling was exhausted (attempt cap or age
   * ceiling, whichever came first) with still no definitive answer,
   * and this intent is now `'expired'`. `stillPending` — too early, or
   * still within the retry budget; try again next sweep. `skipped` —
   * already flagged for manual review by an earlier sweep run; not
   * re-queried at all.
   */
  outcome: 'confirmedFailed' | 'needsManualReview' | 'stillPending' | 'skipped';
  /** Only set for `confirmedFailed` — hand this to `ConversationService.handlePaymentResult`, exactly like a real callback would be. */
  callbackResult?: Extract<ProcessCallbackResult, { status: 'failed' }>;
  /** Only set for `needsManualReview` — human-readable, safe to forward straight into an admin notification. */
  reviewReason?: string;
}

export type ProcessCallbackResult =
  | { status: 'duplicate' }
  | { status: 'ignored'; reason: string }
  | { status: 'unmatched'; checkoutRequestId: string }
  | {
      status: 'amount_mismatch';
      intentId: string;
      conversationId: string;
      snapshotId: string;
    }
  | {
      status: 'succeeded';
      intentId: string;
      conversationId: string;
      snapshotId: string;
      amountKes: number;
      /** Empty string when a manually-recorded payment had no M-Pesa code behind it (cash, bank transfer) — never a fabricated one. */
      mpesaReceiptNumber: string;
      /**
       * Present only when a super admin settled this intent themselves
       * rather than Daraja settling it (§ super-admin manual payment
       * orders). Carried on the result so the entire downstream path —
       * order creation, stock reservation, referral commission, wallet,
       * shipment, notifications — is the same code for both, with the
       * single difference being what gets recorded about how the money
       * arrived.
       */
      manualPayment?: ManualPaymentRecord | null;
    }
  | {
      status: 'failed';
      intentId: string;
      conversationId: string;
      snapshotId: string;
      reason: string;
    };

class PaymentService {
  async createIntent(input: CreateIntentInput): Promise<string> {
    return paymentIntentRepository.create(input);
  }

  /**
   * Settles an intent for money that arrived outside Daraja
   * (§ super-admin manual payment orders) — cash at a stand, a
   * customer-initiated M-Pesa transfer, or a bank transfer.
   *
   * This is the one place in the system where a `'succeeded'` payment
   * exists on a human's word rather than on a provider callback, so
   * three things are true of it deliberately:
   *
   * - It never fabricates an M-Pesa receipt. `mpesaReceiptNumber` on
   *   the resulting order carries the real code only when the method is
   *   `'mpesa_manual'` and the super admin typed one; cash and bank
   *   transfers leave it null rather than inventing something that
   *   looks like a Safaricom receipt to every downstream report.
   * - It records *who* asserted it, on the intent itself, in the same
   *   write that sets the status.
   * - It refuses an intent that is not still `'pending'` — an intent
   *   already settled by Daraja, or by another super admin a moment
   *   earlier, must never be double-settled into a second order.
   */
  async recordManualPayment(input: {
    businessId: string;
    intentId: string;
    manualPayment: Omit<ManualPaymentRecord, 'recordedAt'>;
  }): Promise<{ settled: boolean; reason?: string }> {
    const intent = await paymentIntentRepository.findById(input.intentId);
    if (!intent) {
      return { settled: false, reason: 'Payment intent not found' };
    }
    if (intent.businessId !== input.businessId) {
      return { settled: false, reason: 'Payment intent not found' };
    }
    if (intent.status !== 'pending') {
      return {
        settled: false,
        reason: `This payment is already ${intent.status} — it cannot be recorded as manually paid.`,
      };
    }

    const { settled } = await paymentIntentRepository.recordManualPayment(
      input.intentId,
      input.manualPayment,
      'pending',
    );
    if (!settled) {
      // Lost the race against a Daraja callback or a second super
      // admin between the read above and the transaction.
      return { settled: false, reason: 'This payment was settled by someone else a moment ago.' };
    }

    await publishEvent(input.businessId, 'ManualPaymentRecorded', 'paymentIntent', input.intentId, {
      method: input.manualPayment.method,
      reference: input.manualPayment.reference,
      amountKes: intent.amountKes,
      recordedByUid: input.manualPayment.recordedByUid,
      phoneNumber: intent.phoneNumber,
    });

    return { settled: true };
  }

  /**
   * Completes an intent Daraja itself already confirmed succeeded —
   * via the STK Push Query `reconcileStuckIntents` runs — but whose
   * callback never arrived at all, ever (§ payment reconciliation:
   * complete manually). That sweep's own `needsManualReview` outcome
   * names exactly this gap ("confirm against the M-Pesa statement and
   * resolve manually") without anything that actually resolved it —
   * this is that action.
   *
   * Deliberately a different method from `recordManualPayment` above,
   * not a relaxed version of it: that one settles an intent no STK
   * push was ever attempted against, and refuses anything but
   * `'pending'`. This one settles an intent that *did* get a real STK
   * attempt — it has a live `attempts` entry a `'pending'` intent
   * never has — and requires `'processing'`, so the two can never be
   * used on each other's intents by accident.
   *
   * Never fabricates a receipt: the caller must already have one, read
   * off the M-Pesa statement or the confirmation SMS. Guarded exactly
   * like `recordManualPayment` — refuses anything but the expected
   * status, so a real callback landing in the same instant cannot be
   * double-settled by this. The still-open risk this alone cannot
   * close is a callback that lands *after* this call returns; closing
   * that is `ConversationService.completeOrder`'s job, which now
   * refuses to create a second order for a snapshot already completed.
   */
  async completeManually(input: {
    businessId: string;
    intentId: string;
    mpesaReceiptNumber: string;
    recordedByUid: string;
    recordedByName: string;
    note: string | null;
  }): Promise<{ settled: boolean; reason?: string; result?: Extract<ProcessCallbackResult, { status: 'succeeded' }> }> {
    const intent = await paymentIntentRepository.findById(input.intentId);
    if (!intent) {
      return { settled: false, reason: 'Payment intent not found' };
    }
    if (intent.businessId !== input.businessId) {
      return { settled: false, reason: 'Payment intent not found' };
    }
    if (intent.status !== 'processing') {
      return {
        settled: false,
        reason: `This payment is already ${intent.status} — it cannot be completed manually.`,
      };
    }
    const mpesaReceiptNumber = input.mpesaReceiptNumber.trim();
    if (!mpesaReceiptNumber) {
      return { settled: false, reason: 'An M-Pesa receipt number is required.' };
    }

    const manualPayment: Omit<ManualPaymentRecord, 'recordedAt'> = {
      method: 'mpesa_manual',
      reference: mpesaReceiptNumber,
      recordedByUid: input.recordedByUid,
      recordedByName: input.recordedByName,
      note: input.note,
    };

    const { settled } = await paymentIntentRepository.recordManualPayment(
      input.intentId,
      manualPayment,
      'processing',
    );
    if (!settled) {
      // Lost the race against the real callback finally arriving, or
      // against another super admin doing this same thing a moment ago.
      return { settled: false, reason: 'This payment was just resolved by something else — a late callback may have arrived.' };
    }

    // The real STK attempt is left dangling in 'initiated' otherwise —
    // resolve it so the record this intent carries is consistent with
    // what actually happened, not just with what recordManualPayment
    // touches.
    const pending = await paymentIntentRepository.getPendingAttempt(input.intentId);
    if (pending) {
      await paymentIntentRepository.resolveAttempt(input.intentId, pending.attemptId, {
        status: 'succeeded',
        resultCode: 0,
        resultDesc: `Manually confirmed by ${input.recordedByName}`,
        mpesaReceiptNumber,
      });
    }

    // Re-read rather than fabricate a client-side timestamp for the
    // result below — `recordedAt` is whatever the transaction above
    // actually persisted.
    const updated = await paymentIntentRepository.findById(input.intentId);

    await publishEvent(input.businessId, 'ManualPaymentRecorded', 'paymentIntent', input.intentId, {
      method: 'mpesa_manual',
      reference: mpesaReceiptNumber,
      amountKes: intent.amountKes,
      recordedByUid: input.recordedByUid,
      phoneNumber: intent.phoneNumber,
    });

    return {
      settled: true,
      result: {
        status: 'succeeded',
        intentId: input.intentId,
        conversationId: intent.conversationId,
        snapshotId: intent.conversationCheckoutSnapshotId,
        amountKes: intent.amountKes,
        mpesaReceiptNumber,
        manualPayment: updated?.manualPayment ?? null,
      },
    };
  }

  /**
   * Asks Safaricom what happened to the payment a customer is watching
   * right now, and settles it from their answer (§ payment
   * auto-recovery).
   *
   * Built because the callback is not reliable and the whole checkout
   * was staked on it: production STK pushes were confirmed succeeded by
   * Safaricom's own query API while not one callback was ever
   * delivered, so the customer paid, sat on the waiting screen, and no
   * order was ever created. The nightly sweep found these, but a
   * customer will not wait until 02:00.
   *
   * The receipt is the reason this is not simply `reconcileStuckIntents`
   * with a shorter timer. That sweep refuses to settle a confirmed
   * success because the query response carries no M-Pesa receipt, and
   * it is right that it never invents one — but "no receipt" is a
   * bookkeeping problem, and refusing to create the order turns it into
   * the customer's problem instead, which is worse. Safaricom's
   * `ResultCode 0` is a definitive statement that the money moved. So
   * the order is created with an empty receipt, exactly as a cash order
   * already is, and the `CheckoutRequestID` — which Safaricom can trace
   * on their own side — is what reconciles it.
   *
   * Idempotency deliberately uses the same `providerEventId` a real
   * callback would (`checkoutRequestId`), so a late callback for this
   * payment is recognised as a duplicate and cannot settle it twice.
   */
  async recoverProcessingPayment(
    businessId: string,
    conversationId: string,
    options: { stuckAfterMs?: number; maxQueryAttempts?: number } = {},
  ): Promise<ProcessCallbackResult | null> {
    const stuckAfterMs = options.stuckAfterMs ?? DEFAULT_RECOVERY_AFTER_MS;
    const maxQueryAttempts = options.maxQueryAttempts ?? DEFAULT_MAX_QUERY_ATTEMPTS;

    // Only the payment this checkout is actually waiting on. A
    // conversation is reused per phone number and every abandoned
    // attempt leaves its intent `processing` on purpose, so asking the
    // conversation for "the" payment returns an arbitrary one of many —
    // and completing one of those creates an order for a checkout the
    // customer walked away from days ago.
    const conversation = await conversationRepository.findById(conversationId);
    const snapshotId = conversation?.conversationCheckoutSnapshotId;
    if (!conversation || conversation.businessId !== businessId || !snapshotId) {
      return null;
    }

    const match = await paymentIntentRepository.findProcessingBySnapshotId(businessId, snapshotId);
    if (!match) {
      return null;
    }
    return this.recoverIntent(businessId, match.id, match.data, stuckAfterMs, maxQueryAttempts);
  }

  /**
   * The same recovery, for every payment left in flight rather than
   * the one a customer is watching (§ payment auto-recovery).
   *
   * `recoverProcessingPayment` only runs while the payment screen is
   * open, which quietly assumes the customer stays on it. Someone who
   * approves the M-Pesa prompt and closes the tab is exactly the
   * person this exists for: their money moved and nothing was ever
   * polling on their behalf.
   */
  async recoverAllProcessingPayments(
    businessId: string,
    options: { stuckAfterMs?: number; maxQueryAttempts?: number } = {},
  ): Promise<ProcessCallbackResult[]> {
    const stuckAfterMs = options.stuckAfterMs ?? DEFAULT_RECOVERY_AFTER_MS;
    const maxQueryAttempts = options.maxQueryAttempts ?? DEFAULT_MAX_QUERY_ATTEMPTS;

    const processing = await paymentIntentRepository.listByStatus(businessId, ['processing']);
    const results: ProcessCallbackResult[] = [];
    for (const { id, data } of processing) {
      // One bad intent must not stop the sweep reaching the rest —
      // every one of these is somebody's money.
      try {
        const result = await this.recoverIntent(businessId, id, data, stuckAfterMs, maxQueryAttempts);
        if (result) {
          results.push(result);
        }
      } catch {
        // Left for the next run, and for `reconcileStuckIntents`.
      }
    }
    return results;
  }

  private async recoverIntent(
    businessId: string,
    intentId: string,
    intent: PaymentIntent,
    stuckAfterMs: number,
    maxQueryAttempts: number,
  ): Promise<ProcessCallbackResult | null> {
    // Too old to settle on its own. Creating an order for a payment
    // this stale is not a recovery, it is a surprise: the customer has
    // long since given up, may have paid again, and staff may already
    // have resolved it by hand. Past this point it stays with
    // `reconcileStuckIntents` and a human, which is what the sweep did
    // before recovery existed.
    if (Date.now() - intent.updatedAt.toMillis() > RECOVERY_MAX_AGE_MS) {
      return null;
    }

    // Still inside a normal PIN-entry window. Asking Safaricom about a
    // push the customer is actively responding to invites a "not
    // found" that means nothing.
    if (Date.now() - intent.updatedAt.toMillis() < stuckAfterMs) {
      return null;
    }

    const pending = await paymentIntentRepository.getPendingAttempt(intentId);
    if (!pending || pending.queryAttemptCount >= maxQueryAttempts) {
      return null;
    }

    const query = await darajaGateway.queryStkStatus({ businessId, checkoutRequestId: pending.checkoutRequestId });
    await paymentIntentRepository.incrementQueryAttemptCount(intentId, pending.attemptId);

    // Safaricom has no verdict yet — not an error, just "ask again".
    if (query.responseCode !== '0') {
      return null;
    }

    const idempotency = await webhookEventRepository.recordIfNew({
      businessId,
      provider: 'daraja',
      eventKind: 'stk_callback',
      providerEventId: pending.checkoutRequestId,
      payload: { source: 'stk_push_query_recovery', ...query },
      relatedEntityId: intentId,
    });
    if (!idempotency.isNew) {
      // The real callback landed in the gap between the query and this
      // write. It already owns this payment.
      return null;
    }

    const succeeded = query.resultCode === 0;
    await paymentIntentRepository.resolveAttempt(intentId, pending.attemptId, {
      status: succeeded ? 'succeeded' : 'failed',
      resultCode: query.resultCode,
      resultDesc: query.resultDesc,
      mpesaReceiptNumber: null,
    });
    await paymentIntentRepository.updateStatus(intentId, succeeded ? 'succeeded' : 'failed');
    await webhookEventRepository.markProcessed(businessId, 'daraja', pending.checkoutRequestId);

    if (!succeeded) {
      return {
        status: 'failed',
        intentId,
        conversationId: intent.conversationId,
        snapshotId: intent.conversationCheckoutSnapshotId,
        reason: query.resultDesc,
      };
    }

    await publishEvent(businessId, 'PaymentRecoveredWithoutCallback', 'paymentIntent', intentId, {
      checkoutRequestId: pending.checkoutRequestId,
      amountKes: intent.amountKes,
      phoneNumber: intent.phoneNumber,
    });

    return {
      status: 'succeeded',
      intentId,
      conversationId: intent.conversationId,
      snapshotId: intent.conversationCheckoutSnapshotId,
      amountKes: intent.amountKes,
      // Empty, never fabricated. Safaricom's query API does not return
      // a receipt; `CheckoutRequestID` is what traces this payment.
      mpesaReceiptNumber: '',
    };
  }

  async initiateAttempt(
    businessId: string,
    intentId: string,
    input: {
      phone: string;
      amountKes: number;
      accountReference: string;
      transactionDesc: string;
    },
  ): Promise<StkPushResult> {
    // Not caught here — a failed initiation has no checkoutRequestId to
    // record an attempt against. The caller decides how to react
    // (e.g. tell the customer to try again); the intent stays 'pending'
    // so a fresh attempt can still be made against it.
    const result = await darajaGateway.initiateStkPush({ businessId, ...input });

    await paymentIntentRepository.addAttempt(intentId, {
      checkoutRequestId: result.checkoutRequestId,
      merchantRequestId: result.merchantRequestId,
      status: 'initiated',
      resultCode: null,
      resultDesc: null,
      mpesaReceiptNumber: null,
    });
    await paymentIntentRepository.updateStatus(intentId, 'processing');

    return result;
  }

  /**
   * The STK Push Query fallback sweep (§ Daraja Production Integration
   * Verification Audit §2.4/§7) — for a `PaymentIntent` still stuck
   * `'processing'` because its callback never arrived. Never fabricates
   * financial data: a confirmed *failure* is safe to auto-resolve (no
   * amount/receipt involved either way), but a confirmed *success* with
   * no receipt number (Safaricom's query response carries none — see
   * `StkQueryResult`'s own doc comment) is handed to a human rather
   * than guessed at. Returns data only; the caller (the cron route)
   * owns notifying admins and reacting on the conversation, the same
   * separation `processCallback`/the webhook route already keep.
   */
  async reconcileStuckIntents(
    businessId: string,
    options: { stuckAfterMs?: number; expireAfterMs?: number; maxQueryAttempts?: number } = {},
  ): Promise<ReconciliationOutcome[]> {
    const stuckAfterMs = options.stuckAfterMs ?? DEFAULT_STUCK_AFTER_MS;
    const expireAfterMs = options.expireAfterMs ?? DEFAULT_EXPIRE_AFTER_MS;
    const maxQueryAttempts = options.maxQueryAttempts ?? DEFAULT_MAX_QUERY_ATTEMPTS;
    const now = Date.now();

    const processing = await paymentIntentRepository.listByStatus(businessId, ['processing']);
    const outcomes: ReconciliationOutcome[] = [];

    for (const { id: intentId, data: intent } of processing) {
      const updatedAtMs = intent.updatedAt.toMillis();
      const ageMs = now - updatedAtMs;
      if (ageMs < stuckAfterMs) {
        continue; // still within a normal PIN-entry window — not stuck yet, not even worth a query
      }

      const pending = await paymentIntentRepository.getPendingAttempt(intentId);
      if (!pending) {
        // Already resolved (a real callback landed while this sweep was running) — nothing to do.
        continue;
      }

      // Already confirmed succeeded by an earlier sweep run and flagged for
      // manual review (§2.4) — don't ask Daraja the same question again; we
      // already have our answer, we're just waiting on a receipt number,
      // from either a human or a late real callback. No query, no re-notify.
      const alreadyFlagged = await webhookEventRepository.exists(
        businessId,
        'daraja',
        `${pending.checkoutRequestId}:query-confirmed-success`,
      );
      if (alreadyFlagged) {
        outcomes.push({ intentId, checkoutRequestId: pending.checkoutRequestId, outcome: 'skipped' });
        continue;
      }

      // The retry budget itself: once exhausted, stop querying and hand off
      // to a human rather than polling indefinitely — this is the actual
      // "sensible retry limit," counted per attempt, independent of the
      // age-based backstop below.
      if (pending.queryAttemptCount >= maxQueryAttempts) {
        await paymentIntentRepository.updateStatus(intentId, 'expired');
        outcomes.push({
          intentId,
          checkoutRequestId: pending.checkoutRequestId,
          outcome: 'needsManualReview',
          reviewReason: `Payment intent ${intentId} has been queried ${pending.queryAttemptCount} times with no definitive result from Daraja. Marked expired — needs manual investigation against the M-Pesa statement.`,
        });
        continue;
      }

      const query = await darajaGateway.queryStkStatus({ businessId, checkoutRequestId: pending.checkoutRequestId });
      await paymentIntentRepository.incrementQueryAttemptCount(intentId, pending.attemptId);
      const queryAttemptCount = pending.queryAttemptCount + 1;

      if (query.responseCode !== '0') {
        // Daraja's own query couldn't give a definitive answer yet (still processing on their side, or a transient error).
        if (queryAttemptCount >= maxQueryAttempts || ageMs >= expireAfterMs) {
          await paymentIntentRepository.updateStatus(intentId, 'expired');
          outcomes.push({
            intentId,
            checkoutRequestId: pending.checkoutRequestId,
            outcome: 'needsManualReview',
            reviewReason: `Payment intent ${intentId} has been stuck for ${Math.round(ageMs / 60_000)} minutes across ${queryAttemptCount} status checks with no definitive result from Daraja. Marked expired — needs manual investigation against the M-Pesa statement.`,
          });
        } else {
          outcomes.push({ intentId, checkoutRequestId: pending.checkoutRequestId, outcome: 'stillPending' });
        }
        continue;
      }

      if (query.resultCode === 0) {
        // Confirmed succeeded — but the query response has no CallbackMetadata
        // (§2.4), so there's no receipt number to safely complete the order
        // with. Flag under a DISTINCT providerEventId (not the real
        // checkoutRequestId) so this never blocks the real callback's own
        // idempotency slot — if it still arrives with the actual receipt,
        // it must be free to process normally and complete the order.
        await webhookEventRepository.recordIfNew({
          businessId,
          provider: 'daraja',
          eventKind: 'stk_query_reconciliation',
          providerEventId: `${pending.checkoutRequestId}:query-confirmed-success`,
          payload: { source: 'stk_push_query', ...query },
          relatedEntityId: intentId,
        });
        outcomes.push({
          intentId,
          checkoutRequestId: pending.checkoutRequestId,
          outcome: 'needsManualReview',
          reviewReason: `Daraja confirms payment intent ${intentId} succeeded (checked via STK Push Query), but no callback ever arrived and the query response carries no M-Pesa receipt number. Confirm against the M-Pesa statement and resolve manually — the intent is left 'processing' so a late real callback can still complete it normally.`,
        });
        continue;
      }

      // Definite failure. Safe to auto-resolve — a failed STK push callback
      // never carries amount/receipt data either, so there's nothing here a
      // real callback could tell us that this query result doesn't already.
      const idempotency = await webhookEventRepository.recordIfNew({
        businessId,
        provider: 'daraja',
        eventKind: 'stk_callback',
        providerEventId: pending.checkoutRequestId,
        payload: { source: 'stk_push_query', ...query },
        relatedEntityId: intentId,
      });
      if (!idempotency.isNew) {
        // A real callback landed between this sweep's read and this write — it already won. Don't reprocess.
        continue;
      }

      await paymentIntentRepository.resolveAttempt(intentId, pending.attemptId, {
        status: 'failed',
        resultCode: query.resultCode,
        resultDesc: query.resultDesc,
        mpesaReceiptNumber: null,
      });
      await paymentIntentRepository.updateStatus(intentId, 'failed');
      await webhookEventRepository.markProcessed(businessId, 'daraja', pending.checkoutRequestId);

      outcomes.push({
        intentId,
        checkoutRequestId: pending.checkoutRequestId,
        outcome: 'confirmedFailed',
        callbackResult: {
          status: 'failed',
          intentId,
          conversationId: intent.conversationId,
          snapshotId: intent.conversationCheckoutSnapshotId,
          reason: query.resultDesc,
        },
      });
    }

    return outcomes;
  }

  async processCallback(businessId: string, rawPayload: unknown): Promise<ProcessCallbackResult> {
    let callback;
    try {
      callback = darajaGateway.verifyCallback(rawPayload);
    } catch (error) {
      return {
        status: 'ignored',
        reason: error instanceof Error ? error.message : 'malformed payload',
      };
    }

    const idempotency = await webhookEventRepository.recordIfNew({
      businessId,
      provider: 'daraja',
      eventKind: 'stk_callback',
      providerEventId: callback.checkoutRequestId,
      payload: rawPayload as Record<string, unknown>,
    });
    if (!idempotency.isNew) {
      return { status: 'duplicate' };
    }

    const match = await paymentIntentRepository.findByCheckoutRequestId(
      callback.checkoutRequestId,
    );
    if (!match) {
      await webhookEventRepository.markFailed(
        businessId,
        'daraja',
        callback.checkoutRequestId,
        'No matching payment attempt found (unmatched payment)',
      );
      return { status: 'unmatched', checkoutRequestId: callback.checkoutRequestId };
    }

    const intent = await paymentIntentRepository.findById(match.intentId);
    if (!intent || intent.businessId !== businessId) {
      // Either genuinely missing, or (defense-in-depth) the matched
      // intent belongs to a different tenant than this callback URL —
      // treat both as unmatched, never act on another tenant's payment.
      await webhookEventRepository.markFailed(
        businessId,
        'daraja',
        callback.checkoutRequestId,
        !intent
          ? `Attempt matched but paymentIntents/${match.intentId} does not exist`
          : `Attempt matched paymentIntents/${match.intentId}, which belongs to a different business`,
      );
      return { status: 'unmatched', checkoutRequestId: callback.checkoutRequestId };
    }

    const succeeded = callback.resultCode === 0;
    const amountMatches = succeeded && callback.amountKes === intent.amountKes;

    if (succeeded && !amountMatches) {
      await paymentIntentRepository.resolveAttempt(match.intentId, match.attemptId, {
        status: 'failed',
        resultCode: callback.resultCode,
        resultDesc: `Amount mismatch: expected ${intent.amountKes}, got ${callback.amountKes}`,
        mpesaReceiptNumber: callback.mpesaReceiptNumber ?? null,
      });
      await webhookEventRepository.markFailed(
        businessId,
        'daraja',
        callback.checkoutRequestId,
        'Amount mismatch',
      );
      return {
        status: 'amount_mismatch',
        intentId: match.intentId,
        conversationId: intent.conversationId,
        snapshotId: intent.conversationCheckoutSnapshotId,
      };
    }

    await paymentIntentRepository.resolveAttempt(match.intentId, match.attemptId, {
      status: succeeded ? 'succeeded' : 'failed',
      resultCode: callback.resultCode,
      resultDesc: callback.resultDesc,
      mpesaReceiptNumber: callback.mpesaReceiptNumber ?? null,
    });
    await paymentIntentRepository.updateStatus(
      match.intentId,
      succeeded ? 'succeeded' : 'failed',
    );
    await webhookEventRepository.markProcessed(businessId, 'daraja', callback.checkoutRequestId);

    if (succeeded) {
      return {
        status: 'succeeded',
        intentId: match.intentId,
        conversationId: intent.conversationId,
        snapshotId: intent.conversationCheckoutSnapshotId,
        amountKes: callback.amountKes as number,
        mpesaReceiptNumber: callback.mpesaReceiptNumber as string,
      };
    }
    return {
      status: 'failed',
      intentId: match.intentId,
      conversationId: intent.conversationId,
      snapshotId: intent.conversationCheckoutSnapshotId,
      reason: callback.resultDesc,
    };
  }
}

export const paymentService = new PaymentService();
