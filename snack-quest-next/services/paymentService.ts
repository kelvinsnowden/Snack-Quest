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
