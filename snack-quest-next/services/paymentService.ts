import 'server-only';

import { paymentIntentRepository } from '@/repositories/paymentIntentRepository';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { darajaGateway } from '@/lib/integrations/daraja/darajaGateway';
import type { StkPushResult } from '@/lib/integrations/types';

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

/** How long a `PaymentIntent` can sit in `'processing'` before the reconciliation sweep (§ Daraja Production Integration Verification Audit §2.4/§7) will even ask Daraja about it — long enough to cover a real customer's M-Pesa PIN-entry window, short enough to catch a lost callback quickly. */
const DEFAULT_STUCK_AFTER_MS = 2 * 60 * 1000;
/** Past this age with still no definitive answer from Daraja's own query API, stop polling and hand it to a human instead of polling forever. */
const DEFAULT_EXPIRE_AFTER_MS = 6 * 60 * 60 * 1000;

export interface ReconciliationOutcome {
  intentId: string;
  checkoutRequestId: string;
  /**
   * `confirmedFailed` — Daraja's query definitively says this failed;
   * safe to auto-resolve (a failure carries no financial data to get
   * wrong). `needsManualReview` — either Daraja confirmed *success* but
   * the query response carries no receipt/amount (§2.4 — never
   * fabricate that), or the query stayed inconclusive past
   * `expireAfterMs` and this intent is now `'expired'`. `stillPending` —
   * too early to conclude anything; try again next sweep.
   */
  outcome: 'confirmedFailed' | 'needsManualReview' | 'stillPending';
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
      mpesaReceiptNumber: string;
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
    options: { stuckAfterMs?: number; expireAfterMs?: number } = {},
  ): Promise<ReconciliationOutcome[]> {
    const stuckAfterMs = options.stuckAfterMs ?? DEFAULT_STUCK_AFTER_MS;
    const expireAfterMs = options.expireAfterMs ?? DEFAULT_EXPIRE_AFTER_MS;
    const now = Date.now();

    const processing = await paymentIntentRepository.listByStatus(businessId, ['processing']);
    const outcomes: ReconciliationOutcome[] = [];

    for (const { id: intentId, data: intent } of processing) {
      const updatedAtMs = intent.updatedAt.toMillis();
      const ageMs = now - updatedAtMs;
      if (ageMs < stuckAfterMs) {
        continue; // still within a normal PIN-entry window — not stuck yet
      }

      const pending = await paymentIntentRepository.getPendingAttempt(intentId);
      if (!pending) {
        // Already resolved (a real callback landed while this sweep was running) — nothing to do.
        continue;
      }

      const query = await darajaGateway.queryStkStatus({ businessId, checkoutRequestId: pending.checkoutRequestId });

      if (query.responseCode !== '0') {
        // Daraja's own query couldn't give a definitive answer yet (still processing on their side, or a transient error).
        if (ageMs >= expireAfterMs) {
          await paymentIntentRepository.updateStatus(intentId, 'expired');
          outcomes.push({
            intentId,
            checkoutRequestId: pending.checkoutRequestId,
            outcome: 'needsManualReview',
            reviewReason: `Payment intent ${intentId} has been stuck for over ${Math.round(expireAfterMs / 3_600_000)}h with no definitive result from Daraja, even via status query. Marked expired — needs manual investigation against the M-Pesa statement.`,
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
        const flag = await webhookEventRepository.recordIfNew({
          businessId,
          provider: 'daraja',
          eventKind: 'stk_query_reconciliation',
          providerEventId: `${pending.checkoutRequestId}:query-confirmed-success`,
          payload: { source: 'stk_push_query', ...query },
          relatedEntityId: intentId,
        });
        if (flag.isNew) {
          outcomes.push({
            intentId,
            checkoutRequestId: pending.checkoutRequestId,
            outcome: 'needsManualReview',
            reviewReason: `Daraja confirms payment intent ${intentId} succeeded (checked via STK Push Query), but no callback ever arrived and the query response carries no M-Pesa receipt number. Confirm against the M-Pesa statement and resolve manually — the intent is left 'processing' so a late real callback can still complete it normally.`,
          });
        }
        // else: already flagged by an earlier sweep run — don't notify again every 5 minutes.
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
        // A real callback (or a previous sweep run) already claimed this — don't reprocess.
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
