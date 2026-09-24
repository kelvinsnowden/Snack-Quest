import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import {
  machineTransactionRepository,
  MachineTransactionNotFoundError,
} from '@/repositories/machineTransactionRepository';
import { machineTelemetryEventRepository } from '@/repositories/machineTelemetryEventRepository';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { machineInventoryMovementService } from '@/services/machineInventoryMovementService';
import { defaultVendingAdapterResolver, type VendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import { darajaGateway } from '@/lib/integrations/daraja/darajaGateway';
import type { PaymentGateway, PaymentCallbackResult } from '@/lib/integrations/types';
import type { MachineTransaction, MachineTransactionPaymentMethod } from '@/types';

/**
 * How long a transaction may sit `paid`/`vend_authorized` before the
 * reconciliation sweep treats it as stuck (§ transaction timeout).
 * A real vend completes in seconds; this is sized for "the machine
 * lost connectivity mid-vend and needs time to reconnect and report,"
 * not for the happy path. Chosen conservatively ahead of any real
 * transaction volume — revisit once real machines report how long a
 * genuine reconnect actually takes.
 */
const DEFAULT_STUCK_TRANSACTION_AFTER_MS = 15 * 60 * 1000;

export class SlotUnavailableForSaleError extends Error {
  constructor(machineId: string, slotCode: string, detail: string) {
    super(`Slot ${slotCode} on machine ${machineId} is not available for sale: ${detail}`);
    this.name = 'SlotUnavailableForSaleError';
  }
}

/**
 * The financial core (§ CORE ENTITIES 3, § financial correctness,
 * § M-PESA ARCHITECTURE). The property every method here protects:
 * **a machine's own report is never, by itself, what moves money.**
 *
 * `markPaymentVerified` is called only from the server side of a real
 * payment verification — nothing in this class calls it from a
 * device-facing code path, and nothing device-facing is wired to be
 * *able* to call it (see `docs/VENDING_FOUNDATION.md`'s security
 * section for exactly where that boundary is enforced). `authorizeVend`
 * is the one method that tells hardware to act, and it can only be
 * reached from `paid` — never from `pending`. `applyVendResult` is the
 * one method that accepts a device's own claim, and it is idempotent
 * by construction: the same vend-result report applied twice touches
 * the transaction and the inventory ledger exactly once, because the
 * second call never gets past `machineTelemetryEventRepository`'s own
 * duplicate check to reach either.
 */
class MachineTransactionService {
  constructor(
    private readonly resolveAdapter: VendingAdapterResolver = defaultVendingAdapterResolver,
    /**
     * The same `PaymentGateway` interface every other M-Pesa
     * collection in this codebase already depends on
     * (`services/paymentService.ts`) — not a new "PaymentProvider"
     * abstraction. Daraja today; a card gateway later implements the
     * same three methods and this class never changes.
     */
    private readonly paymentGateway: PaymentGateway = darajaGateway,
  ) {}

  /** Step 1 of the payment flow: a pending transaction, before any money has moved. */
  async createPending(input: {
    businessId: string;
    machineId: string;
    slotId: string;
    paymentMethod: MachineTransactionPaymentMethod;
  }): Promise<{ id: string; transactionRef: string }> {
    const machine = await machineRepository.findById(input.businessId, input.machineId);
    if (!machine) {
      throw new MachineNotFoundError(input.machineId);
    }
    const slot = await machineSlotRepository.findBySlotCode(input.businessId, input.machineId, input.slotId);
    if (!slot) {
      throw new SlotUnavailableForSaleError(input.machineId, input.slotId, 'slot not configured');
    }
    if (!slot.enabled) {
      throw new SlotUnavailableForSaleError(input.machineId, input.slotId, 'slot disabled');
    }
    if (!slot.productId) {
      throw new SlotUnavailableForSaleError(input.machineId, input.slotId, 'no product assigned');
    }
    if (slot.currentQuantity <= 0) {
      throw new SlotUnavailableForSaleError(input.machineId, input.slotId, 'out of stock');
    }

    return machineTransactionRepository.create({
      businessId: input.businessId,
      machineId: input.machineId,
      slotId: input.slotId,
      productId: slot.productId,
      productCatalogue: slot.productCatalogue ?? 'package',
      amountKes: slot.priceKes,
      currency: 'KES',
      paymentMethod: input.paymentMethod,
    });
  }

  /**
   * Step 2: collect the money over M-Pesa (§ M-PESA ARCHITECTURE).
   * Creates the pending transaction, then asks Daraja for an STK push
   * to the customer's own phone — never the machine's own claim, and
   * never routed through `PaymentIntent`/`ConversationService`, which
   * are WhatsApp-checkout-specific (both require a `conversationId`
   * that a vend has no equivalent of). `checkoutRequestId` is
   * persisted immediately so the Daraja webhook route's vending
   * branch can find this transaction the moment Safaricom's callback
   * arrives — see that route's own doc comment for why it must be the
   * *existing* webhook URL, not a new one.
   *
   * If the push itself fails to even reach Safaricom (network error,
   * invalid phone, credentials misconfigured), the transaction is
   * moved straight to `payment_failed` rather than left `pending`
   * forever with no `checkoutRequestId` for anything to ever find —
   * the reconciliation sweep only looks at `paid`/`vend_authorized`,
   * so a push that never left this server would otherwise sit
   * invisible to it.
   */
  async initiateMpesaPayment(input: {
    businessId: string;
    machineId: string;
    slotId: string;
    phoneNumber: string;
  }): Promise<{ id: string; transactionRef: string; checkoutRequestId: string; customerMessage: string }> {
    const { id, transactionRef } = await this.createPending({
      businessId: input.businessId,
      machineId: input.machineId,
      slotId: input.slotId,
      paymentMethod: 'mpesa',
    });
    const transaction = await machineTransactionRepository.findById(input.businessId, id);
    if (!transaction) {
      throw new MachineTransactionNotFoundError(id);
    }

    try {
      const result = await this.paymentGateway.initiateStkPush({
        businessId: input.businessId,
        phone: input.phoneNumber,
        amountKes: transaction.amountKes,
        accountReference: transactionRef,
        transactionDesc: 'Snack Quest vend',
      });
      await machineTransactionRepository.setCheckoutRequest(input.businessId, id, {
        checkoutRequestId: result.checkoutRequestId,
        merchantRequestId: result.merchantRequestId,
      });
      return { id, transactionRef, checkoutRequestId: result.checkoutRequestId, customerMessage: result.customerMessage };
    } catch (error) {
      await machineTransactionRepository.moveStatus(input.businessId, id, 'payment_failed');
      throw error;
    }
  }

  /**
   * By its Safaricom `checkoutRequestId` — a passthrough so the
   * Daraja webhook route's vending branch never reaches into
   * `machineTransactionRepository` directly (§ route → service →
   * repository).
   */
  async findByCheckoutRequestId(businessId: string, checkoutRequestId: string): Promise<{ id: string; data: MachineTransaction } | null> {
    return machineTransactionRepository.findByCheckoutRequestId(businessId, checkoutRequestId);
  }

  /**
   * Step 3: react to Safaricom's own verdict on the STK push from
   * step 2 (§ M-PESA ARCHITECTURE). This is the *only* thing that can
   * move a vending transaction into `paid` — a device never can, and
   * neither can anything that hasn't gone through
   * `darajaGateway.verifyCallback` first. Called from the Daraja
   * webhook route's vending branch, never directly from a route.
   *
   * Idempotent two ways, deliberately redundant rather than trusting
   * either alone: `webhookEventRepository.recordIfNew` is the atomic
   * primitive (Firestore's `create()`-fails-on-duplicate) that closes
   * the race a concurrent redelivery could otherwise win; the
   * `transaction.status !== 'pending'` check below is what makes a
   * *sequential* redelivery (the common case — Safaricom retries on a
   * slow ack) a clean no-op instead of an `IllegalTransactionTransitionError`
   * thrown from `moveStatus` on an already-settled transaction.
   *
   * Authorizes the vend synchronously, in the same call, once payment
   * is confirmed — no command queue exists yet to do this any other
   * way (§ device communication architecture, Phase 1). A hardware
   * refusal here is not this method's problem to report as an error:
   * `authorizeVend` already resolves it into `paid_vend_failed`, and
   * Safaricom still gets its fast 200 either way.
   */
  async handleMpesaCallback(businessId: string, callback: PaymentCallbackResult): Promise<
    | { handled: false }
    | { handled: true; transactionId: string; outcome: 'duplicate' | 'succeeded' | 'failed' | 'amount_mismatch' }
  > {
    const found = await machineTransactionRepository.findByCheckoutRequestId(businessId, callback.checkoutRequestId);
    if (!found) {
      return { handled: false };
    }

    const { isNew } = await webhookEventRepository.recordIfNew({
      businessId,
      provider: 'daraja',
      eventKind: 'vending_stk_callback',
      providerEventId: callback.checkoutRequestId,
      payload: callback as unknown as Record<string, unknown>,
      relatedEntityId: found.id,
    });
    if (!isNew) {
      return { handled: true, transactionId: found.id, outcome: 'duplicate' };
    }

    if (found.data.status !== 'pending') {
      // A sequential redelivery of a callback already acted on — the
      // atomic check above is what protects a *concurrent* one; this
      // is what protects the ordinary "Safaricom retried after a slow
      // ack" case from ever reaching `moveStatus` on a transaction
      // that has already moved on.
      return { handled: true, transactionId: found.id, outcome: 'duplicate' };
    }

    if (callback.resultCode !== 0) {
      await this.markPaymentFailed(businessId, found.id);
      return { handled: true, transactionId: found.id, outcome: 'failed' };
    }

    if (callback.amountKes !== found.data.amountKes) {
      // Real money moved, but not the amount this transaction was
      // created for — never fabricate a match. A human has to look;
      // see `MachineTransactionStatus.manual_review`'s own doc comment.
      await machineTransactionRepository.moveStatus(businessId, found.id, 'manual_review', {
        failureReason: `Daraja confirmed KES ${callback.amountKes} against a KES ${found.data.amountKes} transaction`,
      });
      return { handled: true, transactionId: found.id, outcome: 'amount_mismatch' };
    }

    await this.markPaymentVerified(businessId, found.id, callback.mpesaReceiptNumber ?? '');
    await this.authorizeVend(businessId, found.id);
    return { handled: true, transactionId: found.id, outcome: 'succeeded' };
  }

  /**
   * Server-verified payment, never a device claim. The caller is
   * whatever verifies the payment for real — today, that means a
   * staff action or a future Daraja-callback integration; nothing
   * here accepts a `paymentRef` sourced from `machineTelemetryEvents`.
   */
  async markPaymentVerified(businessId: string, transactionId: string, paymentRef: string): Promise<void> {
    await machineTransactionRepository.moveStatus(businessId, transactionId, 'paid', { paymentRef });
  }

  async markPaymentFailed(businessId: string, transactionId: string): Promise<void> {
    await machineTransactionRepository.moveStatus(businessId, transactionId, 'payment_failed');
  }

  /**
   * Asks the hardware adapter to dispense — only reachable once the
   * transaction is `paid`. An adapter refusal (offline, empty,
   * disabled) moves straight to `paid_vend_failed`, because nothing
   * was actually authorized to reverse.
   */
  async authorizeVend(businessId: string, transactionId: string): Promise<{ authorized: boolean; vendRef: string }> {
    const transaction = await machineTransactionRepository.findById(businessId, transactionId);
    if (!transaction) {
      throw new MachineTransactionNotFoundError(transactionId);
    }
    const machine = await machineRepository.findById(businessId, transaction.machineId);
    if (!machine) {
      throw new MachineNotFoundError(transaction.machineId);
    }

    const adapter = this.resolveAdapter(machine.manufacturer);
    const result = await adapter.authorizeVend(transaction.machineId, transaction.slotId);

    if (!result.authorized) {
      await machineTransactionRepository.moveStatus(businessId, transactionId, 'paid_vend_failed', {
        vendRef: result.vendRef,
        failureReason: result.reason,
      });
      return { authorized: false, vendRef: result.vendRef };
    }

    await machineTransactionRepository.moveStatus(businessId, transactionId, 'vend_authorized', {
      vendRef: result.vendRef,
    });
    return { authorized: true, vendRef: result.vendRef };
  }

  /**
   * Applies a device's own report of what happened to a vend
   * (§ financial correctness, § idempotency). The report is parsed
   * through the machine's adapter — never read as trusted structured
   * data directly — and every application is recorded in
   * `machineTelemetryEvents` first, keyed by its idempotency key, so a
   * retried report (§ offline behaviour) is recognised and ignored
   * before it can touch a transaction or the inventory ledger a
   * second time.
   */
  async applyVendResult(input: {
    businessId: string;
    machineId: string;
    rawPayload: unknown;
    source: string;
    actor: string;
  }): Promise<{ applied: boolean; transactionId: string | null }> {
    const machine = await machineRepository.findById(input.businessId, input.machineId);
    if (!machine) {
      throw new MachineNotFoundError(input.machineId);
    }
    const adapter = this.resolveAdapter(machine.manufacturer);
    const report = adapter.receiveVendResult(input.rawPayload); // throws UnrecognisedHardwarePayloadError, deliberately uncaught here

    const { isNew, id: telemetryEventId } = await machineTelemetryEventRepository.recordIfNew({
      businessId: input.businessId,
      machineId: input.machineId,
      eventType: 'vend_result',
      idempotencyKey: report.idempotencyKey,
      // The device's own clock, kept only as a fact about when it
      // says this happened — never used to set `dispensedAt`, which
      // `machineTransactionRepository.moveStatus` stamps with the
      // server's own receipt time.
      deviceTimestamp: parseDeviceTimestamp(report.deviceTimestamp),
      payload: input.rawPayload as Record<string, unknown>,
      source: input.source,
    });

    if (!isNew) {
      // Already applied by an earlier delivery of the same report —
      // exactly the case § idempotency exists to make a no-op.
      return { applied: false, transactionId: null };
    }

    const found = await machineTransactionRepository.findByVendRef(input.businessId, report.vendRef);
    if (!found) {
      await machineTelemetryEventRepository.markFailed(telemetryEventId, `no transaction found for vendRef ${report.vendRef}`);
      return { applied: false, transactionId: null };
    }

    if (report.status === 'success') {
      await machineTransactionRepository.moveStatus(input.businessId, found.id, 'dispensed', {
        dispenseFailureStatus: null,
        appliedTelemetryEventId: telemetryEventId,
      });
      await machineInventoryMovementService.recordMovement({
        businessId: input.businessId,
        machineId: input.machineId,
        slotId: found.data.slotId,
        reason: 'sale',
        quantityDelta: -1,
        sourceTransactionId: found.id,
        actor: input.actor,
      });
    } else if (report.status === 'unknown') {
      // The device itself cannot say what happened — the same
      // "genuinely don't know, don't guess" case the timeout sweep
      // already routes to `manual_review` for, reached here from an
      // explicit report instead of silence (§ DISPENSE RESULT:
      // "UNKNOWN vend results require reconciliation"). Inventory is
      // never touched — the same rule every other non-success status
      // already follows.
      await machineTransactionRepository.moveStatus(input.businessId, found.id, 'manual_review', {
        failureReason: report.failureReason,
        dispenseFailureStatus: report.status,
        appliedTelemetryEventId: telemetryEventId,
      });
    } else {
      await machineTransactionRepository.moveStatus(input.businessId, found.id, 'paid_vend_failed', {
        failureReason: report.failureReason,
        dispenseFailureStatus: report.status,
        appliedTelemetryEventId: telemetryEventId,
      });
    }

    await machineTelemetryEventRepository.markProcessed(telemetryEventId);
    return { applied: true, transactionId: found.id };
  }

  /**
   * The reconciliation sweep (§ transaction timeout,
   * docs/VENDING_OS_BENCHMARK.md §C/§H) — the exact pattern
   * `PaymentService.reconcileStuckIntents` already proves in
   * production, applied to a second collection rather than invented
   * fresh. A transaction that has sat in `paid` or `vend_authorized`
   * past `stuckAfterMs` with no device report ever arriving is moved
   * to `manual_review`: the machine went offline mid-vend, or its
   * report never reached the server, and nothing else will ever move
   * it on its own. A late report arriving afterward still resolves it
   * — see `MACHINE_TRANSACTION_STATUS_TRANSITIONS['manual_review']`.
   *
   * Deliberately does not attempt to query Daraja directly the way
   * the e-commerce sweep does for a stuck *payment* — every
   * transaction this sweep touches already has a *verified* payment
   * (`paid`/`vend_authorized` are both reachable only from a real
   * Daraja callback); what's unknown here is the *dispense* outcome,
   * which is a fact only the machine holds, not Safaricom.
   */
  async reconcileStuckTransactions(businessId: string, stuckAfterMs = DEFAULT_STUCK_TRANSACTION_AFTER_MS): Promise<{ movedToManualReview: number }> {
    const cutoff = new Date(Date.now() - stuckAfterMs);
    let movedToManualReview = 0;

    for (const status of ['paid', 'vend_authorized'] as const) {
      const stuck = await machineTransactionRepository.listByStatusUpdatedBefore(businessId, status, cutoff);
      for (const { id } of stuck) {
        await machineTransactionRepository.moveStatus(businessId, id, 'manual_review', {
          failureReason: `No device report received within ${Math.round(stuckAfterMs / 60000)} minutes of being marked "${status}"`,
        });
        movedToManualReview += 1;
      }
    }

    return { movedToManualReview };
  }

  /** The customer's money is owed back — recorded, never itself moved. See `docs/VENDING_FOUNDATION.md` for why the actual reversal is explicitly not wired here. */
  async requestRefund(businessId: string, transactionId: string): Promise<void> {
    await machineTransactionRepository.moveStatus(businessId, transactionId, 'refund_requested');
  }

  async markRefunded(businessId: string, transactionId: string): Promise<void> {
    await machineTransactionRepository.moveStatus(businessId, transactionId, 'refunded');
  }

  async findById(businessId: string, transactionId: string): Promise<MachineTransaction | null> {
    return machineTransactionRepository.findById(businessId, transactionId);
  }
}

export const machineTransactionService = new MachineTransactionService();
export { MachineTransactionService };

/** A device's own ISO timestamp, kept as a fact rather than trusted for ordering — an unparseable or missing value is simply absent, never a thrown error over a field nothing downstream depends on. */
function parseDeviceTimestamp(iso: string | null): MachineTransaction['createdAt'] | null {
  if (!iso) {
    return null;
  }
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? null
    : (Timestamp.fromDate(parsed) as unknown as MachineTransaction['createdAt']);
}
