import 'server-only';

import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import {
  machineTransactionRepository,
  MachineTransactionNotFoundError,
} from '@/repositories/machineTransactionRepository';
import {
  machineDispenseCommandRepository,
  DispenseCommandNotFoundError,
  IllegalDispenseCommandTransitionError,
} from '@/repositories/machineDispenseCommandRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineIntegrationService, type MachineIntegrationService } from '@/services/machineIntegrationService';
import { machineEventService } from '@/services/machineEventService';
import { defaultVendingAdapterResolver, type VendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import {
  HardwareAuthenticationError,
  HardwareTimeoutError,
  HardwareUnreachableError,
  type DispenseResultStatus,
} from '@/lib/vending/hardwareAdapter';
import { hasCapability } from '@/lib/vending/protocol/capabilities';
import { manufacturerSlotIdFor } from '@/lib/vending/slotMapping';
import {
  IN_FLIGHT_DISPENSE_COMMAND_STATUSES,
  type DispenseCommandStatus,
  type IntegrationErrorKind,
  type MachineDispenseCommand,
} from '@/types';

/** How long a queued (inbound) machine has to collect a dispense before it must be refused — the customer is standing there; after this they've gone and are owed a refund, not a late snack. */
const QUEUED_COMMAND_TTL_MS = 2 * 60 * 1000;
/** An in-flight command with no outcome after this long is `timeout` — sized like the transaction sweep's own window. */
const DEFAULT_IN_FLIGHT_TIMEOUT_MS = 15 * 60 * 1000;

export type DispenseDispatchOutcome =
  /** Handed to the integration; the machine confirmed receipt (synchronous adapters). */
  | 'acknowledged'
  /** Queued for an inbound machine to collect on its next poll. */
  | 'sent'
  /** Provably not executed — safe to refund. */
  | 'rejected'
  /** May or may not have reached the machine — manual review, never an automatic retry. */
  | 'unknown'
  /** This transaction was already dispatched; nothing was sent again. */
  | 'duplicate';

export interface DispenseDispatchResult {
  outcome: DispenseDispatchOutcome;
  command: MachineDispenseCommand;
}

export class TransactionNotPaidError extends Error {
  constructor(transactionId: string, status: string) {
    super(`Transaction ${transactionId} is "${status}" — only a server-verified paid transaction can be dispensed`);
    this.name = 'TransactionNotPaidError';
  }
}

function classifyHardwareError(error: unknown): { delivered: 'no' | 'maybe'; kind: IntegrationErrorKind; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof HardwareUnreachableError) {
    return { delivered: 'no', kind: 'connection', message };
  }
  if (error instanceof HardwareAuthenticationError) {
    // Rejected at the door — the instruction was never accepted.
    return { delivered: 'no', kind: 'authentication', message };
  }
  if (error instanceof HardwareTimeoutError) {
    return { delivered: 'maybe', kind: 'timeout', message };
  }
  // Anything unclassified is treated as "may have been delivered" —
  // the conservative reading when a physical machine is on the other end.
  return { delivered: 'maybe', kind: 'protocol', message };
}

/**
 * Machine command safety (§ MACHINE COMMAND SAFETY, § IDEMPOTENCY).
 *
 * The one path by which a paid transaction becomes an instruction to a
 * physical machine, and the one rule it exists to enforce: **a machine
 * is told to dispense at most once per paid transaction**, no matter
 * how many times the dispatch is attempted.
 *
 * Order of operations, deliberately:
 *   1. verify the transaction is `paid` (server-verified payment only);
 *   2. **claim** `machineDispenseCommands/dsp_{transactionId}` with an
 *      atomic `create()` — a second caller finds the claim and stops;
 *   3. check the integration gate (active, manufacturer not suspended,
 *      no sandbox machines on production);
 *   4. only then call the adapter.
 * The hardware call is never before the claim — the defect this
 * replaces called the adapter first and wrote the status after.
 */
class DispenseCommandService {
  constructor(
    private readonly resolveAdapter: VendingAdapterResolver = defaultVendingAdapterResolver,
    private readonly integrations: Pick<MachineIntegrationService, 'dispenseGate'> = machineIntegrationService,
  ) {}

  async dispatchForTransaction(businessId: string, transactionId: string, requestedBy: string): Promise<DispenseDispatchResult> {
    const transaction = await machineTransactionRepository.findById(businessId, transactionId);
    if (!transaction) {
      throw new MachineTransactionNotFoundError(transactionId);
    }
    const existing = await machineDispenseCommandRepository.findByTransactionId(businessId, transactionId);
    if (existing) {
      return { outcome: 'duplicate', command: existing };
    }
    if (transaction.status !== 'paid') {
      throw new TransactionNotPaidError(transactionId, transaction.status);
    }
    const machine = await machineRepository.findById(businessId, transaction.machineId);
    if (!machine) {
      throw new MachineNotFoundError(transaction.machineId);
    }
    const slot = await machineSlotRepository.findBySlotCode(businessId, transaction.machineId, transaction.slotId);

    const claim = await machineDispenseCommandRepository.claim({
      businessId,
      machineId: transaction.machineId,
      machineCode: machine.machineCode,
      transactionId,
      paymentRef: transaction.paymentRef,
      slotCode: transaction.slotId,
      manufacturerSlotId: slot ? manufacturerSlotIdFor(slot) : transaction.slotId,
      productId: transaction.productId,
      quantity: 1,
      adapterKey: machine.manufacturer,
      requestedBy,
      expiresAt: new Date(Date.now() + QUEUED_COMMAND_TTL_MS),
    });
    if (!claim.claimed) {
      return { outcome: 'duplicate', command: claim.command };
    }
    const command = claim.command;

    const gate = await this.integrations.dispenseGate(businessId, transaction.machineId);
    if (!gate.allowed) {
      return this.finish(businessId, transactionId, 'rejected', 'rejected', { failureReason: gate.reason }, gate.reason, 'gate');
    }

    const adapter = this.resolveAdapter(machine.manufacturer);
    if (!hasCapability(adapter.capabilities(), 'vend')) {
      const reason = `adapter "${machine.manufacturer}" cannot dispense`;
      return this.finish(businessId, transactionId, 'rejected', 'rejected', { failureReason: reason }, reason, 'gate');
    }

    await machineDispenseCommandRepository.moveStatus(businessId, transactionId, 'authorized', {}, 'payment verified; integration gate open');

    try {
      const result = await adapter.authorizeVend(transaction.machineId, transaction.slotId, {
        commandRef: command.commandRef,
        manufacturerSlotId: command.manufacturerSlotId ?? undefined,
      });
      if (!result.authorized) {
        return this.finish(businessId, transactionId, 'rejected', 'rejected', { vendRef: result.vendRef, failureReason: result.reason }, result.reason, 'machine');
      }
      const delivery = result.delivery ?? 'synchronous';
      if (delivery === 'queued') {
        return this.finish(businessId, transactionId, 'sent', 'sent', { vendRef: result.vendRef, delivery }, 'queued for the machine to collect', 'machine');
      }
      await machineIntegrationRepository.recordSignal(transaction.machineId, 'api_request');
      return this.finish(businessId, transactionId, 'acknowledged', 'acknowledged', { vendRef: result.vendRef, delivery }, 'accepted by the machine', 'machine');
    } catch (error) {
      const classified = classifyHardwareError(error);
      await machineIntegrationRepository.recordError(transaction.machineId, classified.kind, classified.message);
      if (classified.delivered === 'no') {
        return this.finish(businessId, transactionId, 'rejected', 'rejected', { failureReason: classified.message }, classified.message, 'machine');
      }
      // No hardware reference came back. The command ref is what the
      // integration was sent as its idempotency key, so it is the one
      // handle a late report or a pulled status can be matched on.
      return this.finish(
        businessId,
        transactionId,
        'unknown',
        'unknown',
        { vendRef: command.commandRef, failureReason: `dispense outcome unknown: ${classified.message}`, dispenseResultStatus: 'unknown' },
        classified.message,
        'machine',
      );
    }
  }

  /**
   * A machine's own progress report for a command it collected
   * (`acknowledged` → `dispensing`). Scoped to the authenticated
   * machine: a command belonging to any other machine is reported as
   * not found. Re-sending the same state is a no-op, not an error.
   */
  async recordProgress(
    businessId: string,
    machineId: string,
    commandRef: string,
    to: 'acknowledged' | 'dispensing',
  ): Promise<MachineDispenseCommand> {
    const command = await this.requireOwnedCommand(businessId, machineId, commandRef);
    if (to === 'acknowledged' && command.status === 'sent' && command.expiresAt.toMillis() < Date.now()) {
      // Collected too late — refuse execution rather than dispense to
      // someone who has already walked away.
      await machineDispenseCommandRepository.moveStatus(businessId, command.transactionId, 'timeout', {}, 'acknowledged after expiry — machine must not dispense');
      throw new IllegalDispenseCommandTransitionError('timeout', 'acknowledged');
    }
    const { changed, command: updated } = await machineDispenseCommandRepository.moveStatus(businessId, command.transactionId, to, {}, `machine reported ${to}`, { allowNoop: true });
    if (changed && to === 'dispensing') {
      await machineEventService.record({
        businessId,
        machineId,
        type: 'DISPENSE_STARTED',
        source: 'dispense_ledger',
        dedupeKey: `dispense:${command.commandRef}:started`,
        slotCode: command.slotCode,
        data: { commandRef: command.commandRef, transactionId: command.transactionId },
      });
    }
    return updated;
  }

  /**
   * Records the command-side outcome of a vend result the transaction
   * service has already applied (money and inventory live there). Never
   * throws for a command that's already terminal — a duplicate report
   * has already been handled.
   */
  async recordOutcome(businessId: string, transactionId: string, status: DispenseResultStatus, failureReason: string | null): Promise<void> {
    const command = await machineDispenseCommandRepository.findByTransactionId(businessId, transactionId);
    if (!command) {
      // A pre-command-ledger transaction; nothing to update.
      return;
    }
    const to: DispenseCommandStatus = status === 'success' ? 'dispensed' : status === 'unknown' ? 'unknown' : 'failed';
    try {
      await machineDispenseCommandRepository.moveStatus(
        businessId,
        transactionId,
        to,
        { dispenseResultStatus: status, failureReason: status === 'success' ? null : failureReason },
        `machine reported ${status}`,
        { allowNoop: true },
      );
      if (to === 'dispensed') {
        await machineIntegrationRepository.recordSignal(command.machineId, 'dispense_success');
      }
    } catch (error) {
      if (!(error instanceof IllegalDispenseCommandTransitionError)) {
        throw error;
      }
    }
  }

  /** Queued commands an inbound machine should execute now — for the v1 command poll. */
  async listQueuedForMachine(businessId: string, machineId: string): Promise<MachineDispenseCommand[]> {
    return machineDispenseCommandRepository.listQueuedForMachine(businessId, machineId);
  }

  async findByTransactionId(businessId: string, transactionId: string): Promise<MachineDispenseCommand | null> {
    return machineDispenseCommandRepository.findByTransactionId(businessId, transactionId);
  }

  async listForMachine(businessId: string, machineId: string, limit?: number): Promise<MachineDispenseCommand[]> {
    return machineDispenseCommandRepository.listByMachine(businessId, machineId, limit);
  }

  /**
   * The command-side timeout sweep: in-flight commands with no outcome
   * past the threshold become `timeout`. The transaction sweep moves
   * the money side to manual review on its own schedule; a late report
   * still resolves both.
   */
  async sweepTimedOut(businessId: string, stuckAfterMs = DEFAULT_IN_FLIGHT_TIMEOUT_MS): Promise<{ timedOut: number }> {
    const cutoff = new Date(Date.now() - stuckAfterMs);
    let timedOut = 0;
    for (const status of IN_FLIGHT_DISPENSE_COMMAND_STATUSES) {
      for (const command of await machineDispenseCommandRepository.listByStatusUpdatedBefore(businessId, status, cutoff)) {
        try {
          await machineDispenseCommandRepository.moveStatus(businessId, command.transactionId, 'timeout', { dispenseResultStatus: 'timeout' }, `no outcome within ${Math.round(stuckAfterMs / 60000)} minutes`);
          await machineIntegrationRepository.recordError(command.machineId, 'timeout', `dispense ${command.commandRef} timed out`);
          timedOut += 1;
        } catch (error) {
          if (!(error instanceof IllegalDispenseCommandTransitionError)) {
            throw error;
          }
        }
      }
    }
    return { timedOut };
  }

  private async finish(
    businessId: string,
    transactionId: string,
    to: DispenseCommandStatus,
    outcome: Exclude<DispenseDispatchOutcome, 'duplicate'>,
    fields: Parameters<typeof machineDispenseCommandRepository.moveStatus>[3],
    detail: string | null,
    /** `gate`: refused by Snack Quest's own checks — a configuration fact, left out of hardware reliability figures. `machine`: the integration or hardware answered. */
    stage: 'gate' | 'machine',
  ): Promise<DispenseDispatchResult> {
    const { command } = await machineDispenseCommandRepository.moveStatus(businessId, transactionId, to, fields, detail);
    // A refusal by our own gate is a configuration fact, not a hardware
    // one — tagged so reliability analytics can leave it out.
    await machineEventService.record({
      businessId,
      machineId: command.machineId,
      type: outcome === 'acknowledged' || outcome === 'sent' ? 'DISPENSE_REQUESTED' : 'DISPENSE_FAILED',
      source: 'dispense_ledger',
      dedupeKey: `dispense:${command.commandRef}:dispatch`,
      slotCode: command.slotCode,
      data: { commandRef: command.commandRef, transactionId, outcome, stage, reason: command.failureReason },
    });
    return { outcome, command };
  }

  private async requireOwnedCommand(businessId: string, machineId: string, commandRef: string): Promise<MachineDispenseCommand> {
    const command = await machineDispenseCommandRepository.findByCommandRef(businessId, commandRef);
    if (!command || command.machineId !== machineId) {
      throw new DispenseCommandNotFoundError(commandRef);
    }
    return command;
  }
}

export const dispenseCommandService = new DispenseCommandService();
export { DispenseCommandService, DispenseCommandNotFoundError, IllegalDispenseCommandTransitionError };
