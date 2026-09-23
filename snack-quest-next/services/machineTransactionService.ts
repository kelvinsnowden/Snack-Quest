import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import {
  machineTransactionRepository,
  MachineTransactionNotFoundError,
} from '@/repositories/machineTransactionRepository';
import { machineTelemetryEventRepository } from '@/repositories/machineTelemetryEventRepository';
import { machineInventoryMovementService } from '@/services/machineInventoryMovementService';
import { defaultVendingAdapterResolver, type VendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import type { MachineTransaction, MachineTransactionPaymentMethod } from '@/types';

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
  constructor(private readonly resolveAdapter: VendingAdapterResolver = defaultVendingAdapterResolver) {}

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

    if (report.dispensed) {
      await machineTransactionRepository.moveStatus(input.businessId, found.id, 'dispensed', {
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
    } else {
      await machineTransactionRepository.moveStatus(input.businessId, found.id, 'paid_vend_failed', {
        failureReason: report.failureReason,
        appliedTelemetryEventId: telemetryEventId,
      });
    }

    await machineTelemetryEventRepository.markProcessed(telemetryEventId);
    return { applied: true, transactionId: found.id };
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
