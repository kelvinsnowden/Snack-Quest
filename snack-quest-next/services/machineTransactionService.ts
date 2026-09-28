import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import {
  machineTransactionRepository,
  MachineTransactionNotFoundError,
  IllegalTransactionTransitionError,
} from '@/repositories/machineTransactionRepository';
import { machineTelemetryEventRepository } from '@/repositories/machineTelemetryEventRepository';
import { webhookEventRepository } from '@/repositories/webhookEventRepository';
import { machineInventoryMovementService, InsufficientMachineStockError } from '@/services/machineInventoryMovementService';
import { DispenseCommandService } from '@/services/dispenseCommandService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { machineEventService } from '@/services/machineEventService';
import { eventTypeForDispenseResult } from '@/lib/vending/machineEvents';
import { decideVendOutcome } from '@/lib/vending/vendOutcomeDecision';
import { logger } from '@/lib/observability/logger';
import { defaultVendingAdapterResolver, findAdapterRegistration, type VendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import type { VendResultReport } from '@/lib/vending/hardwareAdapter';
import { darajaGateway } from '@/lib/integrations/daraja/darajaGateway';
import type { PaymentGateway, PaymentCallbackResult } from '@/lib/integrations/types';
import type { MachineDispenseCommand, MachineTransaction, MachineTransactionPaymentMethod } from '@/types';

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

/**
 * How long a transaction may sit `pending` — payment never confirmed
 * one way or the other — before the reconciliation sweep asks Daraja
 * directly (§ transaction timeout, mirroring
 * `PaymentService.reconcileStuckIntents`'s own `queryStkStatus`
 * fallback for the e-commerce checkout). A real STK push resolves
 * within a couple of minutes at most; past that, the customer has
 * either completed or abandoned the M-Pesa prompt and a lost/delayed
 * Daraja callback is the more likely explanation than "still waiting."
 */
const DEFAULT_STUCK_PENDING_AFTER_MS = 5 * 60 * 1000;

/**
 * How long a `pending` transaction may go with Daraja's own query
 * still returning no definitive verdict before the sweep gives up
 * asking and hands it to a human instead of retrying forever. This
 * cron runs daily (unlike the e-commerce path's per-poll recovery
 * attempt), so a handful of hours is "the query itself is stuck," not
 * "still within a normal retry budget."
 */
const DEFAULT_PENDING_QUERY_EXPIRE_AFTER_MS = 6 * 60 * 60 * 1000;

/** Pull-reconciliation schedule for an outbound dispense whose outcome is unknown: ask again after 1 min, 5 min, 15 min, 1 h, 6 h, 24 h — then leave it with a human. */
const PULL_RECONCILE_BACKOFF_MS = [0, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];

export class SlotUnavailableForSaleError extends Error {
  constructor(machineId: string, slotCode: string, detail: string) {
    super(`Slot ${slotCode} on machine ${machineId} is not available for sale: ${detail}`);
    this.name = 'SlotUnavailableForSaleError';
  }
}

/** The same idempotency key sent again with different content — a client bug that must be surfaced, never silently resolved either way. */
export class IdempotencyKeyReusedError extends Error {
  constructor(readonly key: string) {
    super(`Idempotency key "${key}" was already used for a different report`);
    this.name = 'IdempotencyKeyReusedError';
  }
}

/**
 * What happened to one outcome report:
 * - `applied` — it changed the sale's state;
 * - `duplicate` — this exact report was already applied;
 * - `already_recorded` — a different report already recorded this (or a more definite) outcome;
 * - `conflict` — it contradicts a decision already acted on (recorded and escalated, money unchanged);
 * - `unknown_vend` — no dispatched vend matches it on this machine.
 */
export type VendReportResult = 'applied' | 'duplicate' | 'already_recorded' | 'conflict' | 'unknown_vend';

export class EmptyCartError extends Error {
  constructor() {
    super('A cart payment needs at least one item');
    this.name = 'EmptyCartError';
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
  /** Every dispense goes through the command ledger, built on this service's own adapter resolver so tests' injected adapters are the ones it reaches. */
  private readonly dispenser: DispenseCommandService;

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
    dispenser?: DispenseCommandService,
  ) {
    this.dispenser = dispenser ?? new DispenseCommandService(resolveAdapter);
  }

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
   * Step 2, generalized to a cart (§ PART 1 — CUSTOMER MACHINE
   * EXPERIENCE, "the UX will be terrible if someone has to make
   * three different payments for three different items"). Creates
   * one `pending` `MachineTransaction` per slot — inventory,
   * settlement and COGS still cost each sale exactly the way they
   * always have, one line item at a time — then asks Daraja for
   * exactly **one** STK push, for the sum of every item's own price,
   * so the customer approves one M-Pesa prompt no matter how many
   * items are in the cart. `checkoutRequestId`/`merchantRequestId`
   * are then stamped onto every transaction in the cart, which is
   * what lets `handleMpesaCallback` find and settle the whole group
   * from Safaricom's one callback. The hardware still only ever
   * dispenses one slot at a time — that is a fact about the machine,
   * not about the payment, and `handleMpesaCallback` authorizes each
   * item's vend in turn once the one payment clears.
   *
   * If any slot fails its own pre-sale check (out of stock, disabled,
   * unassigned), nothing already created for this cart is left
   * dangling `pending` with no `checkoutRequestId` — every
   * transaction created so far is rolled back to `payment_failed`
   * before the original error is rethrown, the same "never invisible
   * to the reconciliation sweep" reasoning `initiateMpesaPayment`
   * (below) always applied to its own single transaction. The same
   * rollback runs if the STK push itself never reaches Safaricom.
   */
  async initiateCartPayment(input: {
    businessId: string;
    machineId: string;
    slotIds: string[];
    phoneNumber: string;
  }): Promise<{
    checkoutRequestId: string;
    merchantRequestId: string;
    customerMessage: string;
    cartRef: string;
    transactions: { id: string; transactionRef: string; slotId: string; amountKes: number }[];
  }> {
    if (input.slotIds.length === 0) {
      throw new EmptyCartError();
    }
    // The same gate the dispatcher applies after payment, applied
    // before it: a machine whose integration isn't active can't
    // dispense, so the customer is never asked to pay for it (and
    // then refunded). The gate's internal reason (suspension,
    // environment) is deliberately not part of the message.
    const gate = await machineIntegrationService.dispenseGate(input.businessId, input.machineId, 'pre_payment');
    if (!gate.allowed) {
      throw new SlotUnavailableForSaleError(input.machineId, input.slotIds.join(','), 'machine is not accepting orders');
    }
    if (gate.integrated) {
      // Ask the machine to poll fast while this customer pays (the poll response's `nextPollSeconds`).
      await machineIntegrationRepository.noteOrderExpected(input.machineId, new Date(Date.now() + 3 * 60 * 1000));
    }

    const created:{ id: string; transactionRef: string; slotId: string; amountKes: number }[] = [];
    try {
      for (const slotId of input.slotIds) {
        const { id, transactionRef } = await this.createPending({
          businessId: input.businessId,
          machineId: input.machineId,
          slotId,
          paymentMethod: 'mpesa',
        });
        const transaction = await machineTransactionRepository.findById(input.businessId, id);
        if (!transaction) {
          throw new MachineTransactionNotFoundError(id);
        }
        created.push({ id, transactionRef, slotId, amountKes: transaction.amountKes });
      }
    } catch (error) {
      await this.failCreated(input.businessId, created);
      throw error;
    }

    const totalAmountKes = created.reduce((sum, t) => sum + t.amountKes, 0);
    const cartRef = `CART-${randomUUID().slice(0, 8).toUpperCase()}`;
    try {
      const result = await this.paymentGateway.initiateStkPush({
        businessId: input.businessId,
        phone: input.phoneNumber,
        amountKes: totalAmountKes,
        accountReference: cartRef,
        transactionDesc: 'Snack Quest vend',
      });
      for (const t of created) {
        await machineTransactionRepository.setCheckoutRequest(input.businessId, t.id, {
          checkoutRequestId: result.checkoutRequestId,
          merchantRequestId: result.merchantRequestId,
        });
      }
      return {
        checkoutRequestId: result.checkoutRequestId,
        merchantRequestId: result.merchantRequestId,
        customerMessage: result.customerMessage,
        cartRef,
        transactions: created,
      };
    } catch (error) {
      await this.failCreated(input.businessId, created);
      throw error;
    }
  }

  private async failCreated(businessId: string, created: { id: string }[]): Promise<void> {
    for (const t of created) {
      await machineTransactionRepository.moveStatus(businessId, t.id, 'payment_failed');
    }
  }

  /**
   * Step 2 for exactly one item — kept as its own method because a
   * single-slot sale (a staff-run diagnostic sale, the simulator, any
   * caller that only ever has one item) shouldn't have to build a
   * one-element array to get it. Implemented as `initiateCartPayment`
   * with a cart of one, so a single-item purchase and a single-item
   * cart are, and stay, provably the same code path — not two
   * implementations that could quietly drift apart.
   */
  async initiateMpesaPayment(input: {
    businessId: string;
    machineId: string;
    slotId: string;
    phoneNumber: string;
  }): Promise<{ id: string; transactionRef: string; checkoutRequestId: string; customerMessage: string }> {
    const cart = await this.initiateCartPayment({
      businessId: input.businessId,
      machineId: input.machineId,
      slotIds: [input.slotId],
      phoneNumber: input.phoneNumber,
    });
    const [transaction] = cart.transactions;
    return {
      id: transaction.id,
      transactionRef: transaction.transactionRef,
      checkoutRequestId: cart.checkoutRequestId,
      customerMessage: cart.customerMessage,
    };
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
   * Authorizes every transaction's own vend synchronously, in the
   * same call, once the one payment covering all of them is
   * confirmed — no command queue exists yet to do this any other way
   * (§ device communication architecture, Phase 1). Operates over
   * `listByCheckoutRequestId`'s whole group, not one transaction: a
   * cart of three items shares one `checkoutRequestId`
   * (`initiateCartPayment`), so one Daraja callback here settles the
   * payment side of all three, then authorizes each one's own vend in
   * turn — the hardware still dispenses one slot at a time, that is
   * just a fact about the machine, never a reason to ask the customer
   * to pay three times. A single-item purchase is a group of one, so
   * every step below is unchanged for it. A hardware refusal on any
   * one item is not this method's problem to report as an error:
   * `authorizeVend` already resolves it into that one transaction's
   * own `paid_vend_failed`, which never stops the rest of the group
   * from being authorized, and Safaricom still gets its fast 200
   * either way.
   */
  async handleMpesaCallback(businessId: string, callback: PaymentCallbackResult): Promise<
    | { handled: false }
    | { handled: true; transactionIds: string[]; outcome: 'duplicate' | 'succeeded' | 'failed' | 'amount_mismatch' }
  > {
    const group = await machineTransactionRepository.listByCheckoutRequestId(businessId, callback.checkoutRequestId);
    if (group.length === 0) {
      return { handled: false };
    }
    const transactionIds = group.map((t) => t.id);

    const { isNew } = await webhookEventRepository.recordIfNew({
      businessId,
      provider: 'daraja',
      eventKind: 'vending_stk_callback',
      providerEventId: callback.checkoutRequestId,
      payload: callback as unknown as Record<string, unknown>,
      // One representative id for the whole cart this callback
      // settles — see `listByCheckoutRequestId`'s own doc comment for
      // why a checkoutRequestId can now cover more than one document.
      relatedEntityId: transactionIds[0],
    });
    if (!isNew) {
      return { handled: true, transactionIds, outcome: 'duplicate' };
    }

    if (!group.some((t) => t.data.status === 'pending')) {
      // A sequential redelivery of a callback already acted on — the
      // atomic check above is what protects a *concurrent* one; this
      // is what protects the ordinary "Safaricom retried after a slow
      // ack" case from ever reaching `moveStatus` on a group that has
      // already moved on.
      return { handled: true, transactionIds, outcome: 'duplicate' };
    }

    if (callback.resultCode !== 0) {
      for (const { id } of group) {
        await this.markPaymentFailed(businessId, id);
      }
      return { handled: true, transactionIds, outcome: 'failed' };
    }

    const totalAmountKes = group.reduce((sum, t) => sum + t.data.amountKes, 0);
    if (callback.amountKes !== totalAmountKes) {
      // Real money moved, but not the amount this cart was created
      // for — never fabricate a match. A human has to look; see
      // `MachineTransactionStatus.manual_review`'s own doc comment.
      for (const { id, data } of group) {
        await machineTransactionRepository.moveStatus(businessId, id, 'manual_review', {
          failureReason: `Daraja confirmed KES ${callback.amountKes} against a KES ${totalAmountKes} cart (this item: KES ${data.amountKes})`,
        });
      }
      return { handled: true, transactionIds, outcome: 'amount_mismatch' };
    }

    for (const { id } of group) {
      await this.markPaymentVerified(businessId, id, callback.mpesaReceiptNumber ?? '');
      await this.authorizeVend(businessId, id);
    }
    return { handled: true, transactionIds, outcome: 'succeeded' };
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
   * Turns a paid transaction into exactly one dispense instruction
   * (§ MACHINE COMMAND SAFETY). Everything physical happens inside
   * `DispenseCommandService.dispatchForTransaction`, which claims the
   * command *before* contacting any hardware — so a retried callback or
   * a concurrent caller finds the claim and never reaches the machine a
   * second time. This method only maps the dispatch outcome onto the
   * money side:
   *
   * - acknowledged / sent → `vend_authorized` (waiting on the outcome)
   * - rejected (provably never executed) → `paid_vend_failed` (refund path)
   * - unknown (may have dispensed) → `manual_review`, never a retry
   * - duplicate → nothing; the first dispatch already moved the money side
   */
  async authorizeVend(businessId: string, transactionId: string): Promise<{ authorized: boolean; vendRef: string | null }> {
    const { outcome, command } = await this.dispenser.dispatchForTransaction(businessId, transactionId, 'system:payment');

    switch (outcome) {
      case 'duplicate':
        return { authorized: !['rejected', 'failed', 'unknown', 'timeout'].includes(command.status), vendRef: command.vendRef };
      case 'acknowledged':
      case 'sent':
        await machineTransactionRepository.moveStatus(businessId, transactionId, 'vend_authorized', { vendRef: command.vendRef });
        return { authorized: true, vendRef: command.vendRef };
      case 'rejected':
        await machineTransactionRepository.moveStatus(businessId, transactionId, 'paid_vend_failed', {
          vendRef: command.vendRef,
          failureReason: command.failureReason,
        });
        return { authorized: false, vendRef: command.vendRef };
      case 'unknown':
        await machineTransactionRepository.moveStatus(businessId, transactionId, 'manual_review', {
          vendRef: command.vendRef,
          failureReason: command.failureReason,
          dispenseFailureStatus: 'unknown',
        });
        return { authorized: false, vendRef: command.vendRef };
    }
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
    return this.applyVendReport({ ...input, report });
  }

  /**
   * The single place a vend outcome — however it arrived (a pushed
   * device report parsed by an adapter, a v1 API call, a webhook, a
   * pulled `getDispenseStatus` during reconciliation) — touches money
   * and inventory.
   *
   * Idempotent and crash-safe:
   * - The report's idempotency key is claimed with a fingerprint of its
   *   content. A repeat with the same content is a no-op once processed,
   *   and is *resumed* if an earlier attempt died part-way. The same key
   *   with different content is refused (`IdempotencyKeyReusedError`).
   * - What to do is decided by `decideVendOutcome` (one pure table),
   *   applied with compare-and-set on the transaction, so two concurrent
   *   reports can never both apply from the same state.
   * - Stock moves under the key `sale:{transactionId}` — at most once per
   *   sale, whichever report or retry gets there.
   * - A report that contradicts a decision already acted on is a
   *   *conflict*: the physical fact is recorded, an operator is alerted,
   *   money is never silently flipped.
   */
  async applyVendReport(input: {
    businessId: string;
    machineId: string;
    report: VendResultReport;
    rawPayload: unknown;
    source: string;
    actor: string;
  }): Promise<{ applied: boolean; transactionId: string | null; result: VendReportResult }> {
    const { report } = input;
    const fingerprint = createHash('sha256').update(JSON.stringify([report.vendRef, report.status])).digest('hex');
    const claim = await machineTelemetryEventRepository.recordIfNew({
      businessId: input.businessId,
      machineId: input.machineId,
      eventType: 'vend_result',
      idempotencyKey: report.idempotencyKey,
      // The device's own clock, kept only as a fact about when it
      // says this happened — never used to set `dispensedAt`, which
      // `machineTransactionRepository.moveStatus` stamps with the
      // server's own receipt time.
      deviceTimestamp: parseDeviceTimestamp(report.deviceTimestamp),
      payload: (typeof input.rawPayload === 'object' && input.rawPayload !== null ? input.rawPayload : { report }) as Record<string, unknown>,
      source: input.source,
      fingerprint,
    });
    const telemetryEventId = claim.id;
    if (!claim.isNew) {
      if (claim.fingerprint && claim.fingerprint !== fingerprint) {
        throw new IdempotencyKeyReusedError(report.idempotencyKey);
      }
      if (claim.processed) {
        return { applied: false, transactionId: null, result: 'duplicate' };
      }
      // An earlier attempt claimed this key and died before finishing:
      // resume it. Every step below is idempotent, so resuming is safe.
    }

    const found = await machineTransactionRepository.findByVendRef(input.businessId, report.vendRef);
    if (!found || found.data.machineId !== input.machineId) {
      await machineTelemetryEventRepository.markFailed(telemetryEventId, `no transaction found for vendRef ${report.vendRef} on this machine`);
      await machineEventService.record({
        businessId: input.businessId,
        machineId: input.machineId,
        // Not a bug to shrug at: a machine saying it dispensed something we
        // never ordered means product may have left without payment
        // (tampering, a local cash sale, or a mis-mapped integration).
        type: 'DISPENSE_UNRECOGNISED',
        source: 'dispense_ledger',
        dedupeKey: `unmatched-vend:${telemetryEventId}`,
        nativeType: 'UNRECOGNISED_DISPENSE_REPORT',
        data: { vendRef: report.vendRef, status: report.status },
      });
      return { applied: false, transactionId: null, result: 'unknown_vend' };
    }

    // Decide against the transaction's current state and apply with
    // compare-and-set. If another report changed the state in between,
    // the CAS refuses and we decide again against the new state — so two
    // contradicting reports racing each other end as "one applied, one
    // conflict", never as an error and never as both applied.
    let transaction = found.data;
    let decision = decideVendOutcome(transaction.status, report.status);
    let result: VendReportResult = 'applied';
    for (let attempt = 0; ; attempt += 1) {
      try {
        result = await this.applyDecision(input, found.id, transaction, decision, telemetryEventId);
        break;
      } catch (error) {
        if (!(error instanceof IllegalTransactionTransitionError) || attempt >= 2) {
          throw error;
        }
        const fresh = await machineTransactionRepository.findById(input.businessId, found.id);
        if (!fresh) {
          throw error;
        }
        transaction = fresh;
        decision = decideVendOutcome(transaction.status, report.status);
      }
    }

    if (decision.kind === 'complete_sale' || decision.kind === 'fail_sale' || decision.kind === 'review') {
      await this.dispenser.recordOutcome(input.businessId, found.id, report.status, report.failureReason);
      await machineEventService.record({
        businessId: input.businessId,
        machineId: input.machineId,
        type: eventTypeForDispenseResult(report.status),
        source: 'dispense_ledger',
        dedupeKey: `dispense-result:${telemetryEventId}`,
        deviceTimestamp: report.deviceTimestamp,
        slotCode: found.data.slotId,
        data: { transactionId: found.id, vendRef: report.vendRef, status: report.status, stage: 'machine', reason: report.failureReason },
      });
    }
    await machineTelemetryEventRepository.markProcessed(telemetryEventId);
    if (!claim.isNew && result === 'already_recorded') {
      // Resuming our own earlier attempt: to the caller this is a repeat of a report already applied.
      result = 'duplicate';
    }
    return { applied: result === 'applied', transactionId: found.id, result };
  }

  private async applyDecision(
    input: { businessId: string; machineId: string; report: VendResultReport; source: string; actor: string },
    transactionId: string,
    transaction: MachineTransaction,
    decision: ReturnType<typeof decideVendOutcome>,
    telemetryEventId: string,
  ): Promise<VendReportResult> {
    const { report } = input;
    const current = transaction.status;
    const found = { id: transactionId, data: transaction };
    let result: VendReportResult = 'applied';
    switch (decision.kind) {
      // `changed: false` means a concurrent or earlier attempt already
      // made this move — the steps after it still run (each is
      // idempotent, which is what makes resuming a crash safe), but only
      // the attempt that made the move reports `applied`.
      case 'complete_sale': {
        const { changed } = await machineTransactionRepository.moveStatus(input.businessId, found.id, 'dispensed', { dispenseFailureStatus: null, appliedTelemetryEventId: telemetryEventId }, { expectedFrom: [current], allowNoop: true });
        await this.recordSaleMovement(input.businessId, input.machineId, found.id, found.data.slotId, input.actor);
        result = changed ? 'applied' : 'duplicate';
        break;
      }
      case 'fail_sale': {
        const { changed } = await machineTransactionRepository.moveStatus(
          input.businessId,
          found.id,
          'paid_vend_failed',
          { failureReason: report.failureReason, dispenseFailureStatus: report.status, appliedTelemetryEventId: telemetryEventId },
          { expectedFrom: [current], allowNoop: true },
        );
        result = changed ? 'applied' : 'duplicate';
        break;
      }
      case 'review': {
        const { changed } = await machineTransactionRepository.moveStatus(
          input.businessId,
          found.id,
          'manual_review',
          { failureReason: report.failureReason, dispenseFailureStatus: report.status, appliedTelemetryEventId: telemetryEventId },
          { expectedFrom: [current], allowNoop: true },
        );
        result = changed ? 'applied' : 'duplicate';
        break;
      }
      case 'noop':
        result = 'already_recorded';
        if (decision.reason === 'same_outcome' && report.status === 'success') {
          // Self-healing: an earlier attempt may have recorded the sale
          // and died before moving stock. The movement is keyed per sale,
          // so ensuring it exists is safe however many times it runs.
          await this.recordSaleMovement(input.businessId, input.machineId, found.id, found.data.slotId, input.actor);
        }
        break;
      case 'conflict': {
        result = 'conflict';
        const conflict = { reportedStatus: report.status, previousStatus: current, reportedAt: Timestamp.now() as unknown as MachineTransaction['createdAt'], source: input.source, resolved: false };
        if (decision.moveToReview) {
          await machineTransactionRepository.moveStatus(input.businessId, found.id, 'manual_review', { outcomeConflict: conflict, failureReason: decision.description }, { expectedFrom: [current], allowNoop: true });
        } else {
          await machineTransactionRepository.recordOutcomeConflict(input.businessId, found.id, conflict);
        }
        if (decision.recordStock) {
          await this.recordSaleMovement(input.businessId, input.machineId, found.id, found.data.slotId, input.actor);
        }
        await machineEventService.record({
          businessId: input.businessId,
          machineId: input.machineId,
          type: 'DISPENSE_OUTCOME_CONFLICT',
          source: 'dispense_ledger',
          dedupeKey: `dispense-conflict:${telemetryEventId}`,
          slotCode: found.data.slotId,
          data: { transactionId: found.id, vendRef: report.vendRef, reported: report.status, previousStatus: current, description: decision.description, severity: decision.severity },
        });
        logger.warn('dispense outcome conflict', { transactionId: found.id, machineId: input.machineId, reported: report.status, previousStatus: current, source: input.source });
        break;
      }
    }

    return result;
  }

  /**
   * The one sale movement per transaction. A physically dispensed
   * product against a ledger that already says zero is recorded as an
   * inventory mismatch for a human, never as negative stock and never as
   * a failed report.
   */
  private async recordSaleMovement(businessId: string, machineId: string, transactionId: string, slotId: string, actor: string): Promise<void> {
    try {
      await machineInventoryMovementService.recordMovement({
        businessId,
        machineId,
        slotId,
        reason: 'sale',
        quantityDelta: -1,
        sourceTransactionId: transactionId,
        actor,
        idempotencyKey: `sale:${transactionId}`,
      });
    } catch (error) {
      if (!(error instanceof InsufficientMachineStockError)) {
        throw error;
      }
      await machineEventService.record({
        businessId,
        machineId,
        type: 'INVENTORY_MISMATCH',
        source: 'dispense_ledger',
        dedupeKey: `sale-against-empty:${transactionId}`,
        slotCode: slotId,
        data: { transactionId, expected: 0, reported: -1, reason: 'machine dispensed from a slot the ledger says is empty' },
      });
    }
  }

  /**
   * Resolves dispenses whose outcome is `unknown` or `timeout` by
   * asking the integration directly (§ RECONCILIATION). Only outbound
   * integrations can be asked — an inbound machine's outcome only ever
   * arrives by the machine reporting it. A definitive answer is applied
   * through `applyVendReport`, exactly like a pushed report; anything
   * short of definitive (still pending, still dispensing, unknown, or
   * the manufacturer unreachable) leaves the case with a human.
   */
  async reconcileUnknownDispenses(businessId: string): Promise<{ resolved: number; stillUnknown: number; itemErrors: Error[] }> {
    let resolved = 0;
    let stillUnknown = 0;
    const itemErrors: Error[] = [];
    const now = new Date();
    for (const status of ['unknown', 'timeout'] as const) {
      for (const command of await machineDispenseCommandRepository.listByStatusUpdatedBefore(businessId, status, now)) {
        // One command failing (a bad report, a transient write error) is
        // counted and skipped; the others still reconcile. Applying a
        // report is idempotent, so the next sweep retries it safely.
        try {
          const outcome = await this.reconcileOneUnknownDispense(businessId, command, now);
          if (outcome === 'resolved') resolved += 1;
          else stillUnknown += 1;
        } catch (error) {
          stillUnknown += 1;
          logger.error('pull reconciliation failed for one dispense; continuing', { commandRef: command.commandRef, error });
          itemErrors.push(new Error(`${command.commandRef}: ${error instanceof Error ? error.message : String(error)}`));
        }
      }
    }
    return { resolved, stillUnknown, itemErrors };
  }

  private async reconcileOneUnknownDispense(businessId: string, command: MachineDispenseCommand, now: Date): Promise<'resolved' | 'still_unknown'> {
    if (findAdapterRegistration(command.adapterKey)?.direction !== 'outbound') {
      return 'still_unknown';
    }
    // Back off per command so a manufacturer outage isn't hammered by every sweep.
    const attempts = command.reconcileAttempts ?? 0;
    if (command.nextReconcileAt && command.nextReconcileAt.toMillis() > now.getTime()) {
      return 'still_unknown';
    }
    if (attempts >= PULL_RECONCILE_BACKOFF_MS.length) {
      // Out of automatic attempts — the case stays with a human.
      return 'still_unknown';
    }
    const scheduleNext = () =>
      machineDispenseCommandRepository.scheduleReconcile(
        businessId,
        command.transactionId,
        attempts + 1,
        attempts + 1 < PULL_RECONCILE_BACKOFF_MS.length ? new Date(now.getTime() + PULL_RECONCILE_BACKOFF_MS[attempts + 1]) : null,
      );
    const vendRef = command.vendRef ?? command.commandRef;
    let report: Awaited<ReturnType<ReturnType<VendingAdapterResolver>['getDispenseStatus']>>;
    try {
      report = await this.resolveAdapter(command.adapterKey).getDispenseStatus(command.machineId, vendRef);
    } catch (error) {
      await machineIntegrationRepository.recordError(command.machineId, 'connection', error instanceof Error ? error.message : 'status lookup failed');
      await scheduleNext();
      return 'still_unknown';
    }
    if (report.state === 'pending' || report.state === 'dispensing' || report.state === 'unknown') {
      await scheduleNext();
      return 'still_unknown';
    }
    const { applied } = await this.applyVendReport({
      businessId,
      machineId: command.machineId,
      report: {
        vendRef,
        dispensed: report.state === 'success',
        status: report.state,
        failureReason: report.failureReason,
        deviceTimestamp: null,
        idempotencyKey: `pull:${command.commandRef}:${report.state}`,
      },
      rawPayload: { reconciledFrom: 'getDispenseStatus', commandRef: command.commandRef, state: report.state },
      source: 'reconciliation',
      actor: 'system:dispense-reconciliation',
    });
    return applied ? 'resolved' : 'still_unknown';
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

  /**
   * The vending equivalent of `PaymentService.reconcileStuckIntents`'s
   * `queryStkStatus` fallback — a lost or delayed Daraja callback
   * leaves a vending transaction `pending` forever otherwise, with the
   * customer already charged and the machine never authorized to
   * dispense (§ transaction timeout; flagged as a gap in
   * `DARAJA_PRODUCTION_VERIFICATION_AUDIT.md` §2.4 for e-commerce and
   * since fixed there — this closes the same gap for vending, which
   * never got it).
   *
   * Deliberately conservative on a confirmed-success query result, the
   * same choice `reconcileStuckIntents` makes for orders and for the
   * identical reason: Safaricom's STK Push Query response carries no
   * `CallbackMetadata`, so there is no M-Pesa receipt number to record
   * against this payment. Authorizing a real dispense — a physical
   * side effect, not just a database write — on the strength of a
   * query response with no receipt to audit later would be a *more*
   * permissive standard than this codebase holds for merely creating
   * an e-commerce order, which is not a defensible direction to move
   * in. So a confirmed success here is flagged to `manual_review` for
   * a human to reconcile against the M-Pesa statement, exactly like
   * the e-commerce path — never auto-authorized.
   *
   * A confirmed *failure*, in contrast, is safe to apply automatically:
   * it is exactly what a normal Daraja failure callback would have
   * done, just arriving via a different transport.
   */
  async reconcileStuckPendingTransactions(
    businessId: string,
    options: { stuckAfterMs?: number; expireAfterMs?: number } = {},
  ): Promise<{ resolvedFailed: number; flaggedForManualReview: number; stillPending: number }> {
    const stuckAfterMs = options.stuckAfterMs ?? DEFAULT_STUCK_PENDING_AFTER_MS;
    const expireAfterMs = options.expireAfterMs ?? DEFAULT_PENDING_QUERY_EXPIRE_AFTER_MS;
    const cutoff = new Date(Date.now() - stuckAfterMs);
    const now = Date.now();

    let resolvedFailed = 0;
    let flaggedForManualReview = 0;
    let stillPending = 0;

    const stuck = await machineTransactionRepository.listByStatusUpdatedBefore(businessId, 'pending', cutoff);
    for (const { id, data } of stuck) {
      if (!data.checkoutRequestId) {
        // Never actually reached Daraja (creation failed before the STK
        // push went out) — nothing to query for.
        continue;
      }

      const ageMs = now - data.updatedAt.toMillis();
      const query = await this.paymentGateway.queryStkStatus({ businessId, checkoutRequestId: data.checkoutRequestId });

      if (query.responseCode !== '0') {
        // Daraja itself has no definitive answer yet.
        if (ageMs >= expireAfterMs) {
          await machineTransactionRepository.moveStatus(businessId, id, 'manual_review', {
            failureReason: `Stuck "pending" for ${Math.round(ageMs / 60000)} minutes with no definitive result from Daraja's own status query — needs manual investigation against the M-Pesa statement.`,
          });
          flaggedForManualReview += 1;
        } else {
          stillPending += 1;
        }
        continue;
      }

      // Distinct providerEventId from the real checkoutRequestId, the
      // same reason `reconcileStuckIntents` uses one: a real callback
      // that arrives later must still be free to process this
      // transaction normally through its own idempotency slot.
      const idempotency = await webhookEventRepository.recordIfNew({
        businessId,
        provider: 'daraja',
        eventKind: 'vending_stk_query_reconciliation',
        providerEventId: `${data.checkoutRequestId}:query-result`,
        payload: { source: 'stk_push_query', ...query },
        relatedEntityId: id,
      });
      if (!idempotency.isNew) {
        // Already resolved by an earlier sweep run (or the real
        // callback landed in the gap between listing and querying).
        continue;
      }

      if (query.resultCode === 0) {
        await machineTransactionRepository.moveStatus(businessId, id, 'manual_review', {
          failureReason: `Daraja confirms this payment succeeded (checked via STK Push Query), but no callback ever arrived and the query response carries no M-Pesa receipt number. Confirm against the M-Pesa statement and resolve manually — never auto-authorized to dispense on this basis alone.`,
        });
        flaggedForManualReview += 1;
      } else {
        await this.markPaymentFailed(businessId, id);
        resolvedFailed += 1;
      }
    }

    return { resolvedFailed, flaggedForManualReview, stillPending };
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
