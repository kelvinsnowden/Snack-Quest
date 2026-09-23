import 'server-only';

import { machineCommandRepository, MachineCommandNotFoundError } from '@/repositories/machineCommandRepository';
import { machineRepository, MachineNotFoundError } from '@/repositories/machineRepository';
import { defaultVendingAdapterResolver, type VendingAdapterResolver } from '@/lib/vending/adapterRegistry';
import { defaultCloudTransport, type CloudTransport } from '@/lib/vending/protocol/cloudTransport';
import { hasCapability, type HardwareCapability } from '@/lib/vending/protocol/capabilities';
import type { MachineCommand, MachineCommandType } from '@/types';

/** Matches the transaction-timeout sweep's own window (§ transaction timeout) — no evidence yet exists to justify a different one for commands. */
const DEFAULT_COMMAND_TTL_MS = 15 * 60 * 1000;

export class CommandNotSupportedError extends Error {
  constructor(manufacturer: string, commandType: MachineCommandType) {
    super(`"${manufacturer}" machines do not declare support for the "${commandType}" command`);
    this.name = 'CommandNotSupportedError';
  }
}

export class CommandExpiredError extends Error {
  constructor(commandRef: string) {
    super(`Command ${commandRef} expired before it was acknowledged`);
    this.name = 'CommandExpiredError';
  }
}

/** Which capability a command type needs before it can be issued at all — checked against the machine's own resolved adapter, never assumed. */
const CAPABILITY_FOR_COMMAND: Record<MachineCommandType, HardwareCapability> = {
  restart: 'remote_restart',
};

/**
 * The remote command center (§ types/machineCommand.ts,
 * docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md §H "NEXT"). Every method
 * here either writes the one fact being asked for (`issueCommand`) or
 * applies a fact the machine itself reported
 * (`acknowledge`/`complete`) — never both at once, the same discipline
 * `MachineTransactionService` already holds between "payment
 * verified" and "vend authorized".
 */
class MachineCommandService {
  constructor(
    private readonly resolveAdapter: VendingAdapterResolver = defaultVendingAdapterResolver,
    private readonly transport: CloudTransport = defaultCloudTransport,
  ) {}

  /**
   * Staff-issued only — there is no path from a device to here. Refuses
   * up front if the machine's own resolved adapter doesn't declare the
   * capability this command needs, rather than writing a command a
   * machine could never act on and discovering that only once it
   * inevitably expires unacknowledged.
   */
  async issueCommand(input: {
    businessId: string;
    machineId: string;
    commandType: MachineCommandType;
    payload?: Record<string, unknown> | null;
    requestedBy: string;
    ttlMs?: number;
  }): Promise<{ commandId: string; commandRef: string }> {
    const machine = await machineRepository.findById(input.businessId, input.machineId);
    if (!machine) {
      throw new MachineNotFoundError(input.machineId);
    }

    const adapter = this.resolveAdapter(machine.manufacturer);
    const requiredCapability = CAPABILITY_FOR_COMMAND[input.commandType];
    if (!hasCapability(adapter.capabilities(), requiredCapability)) {
      throw new CommandNotSupportedError(machine.manufacturer, input.commandType);
    }

    const { id, commandRef } = await machineCommandRepository.create({
      businessId: input.businessId,
      machineId: input.machineId,
      commandType: input.commandType,
      payload: input.payload ?? null,
      requestedBy: input.requestedBy,
      expiresAt: new Date(Date.now() + (input.ttlMs ?? DEFAULT_COMMAND_TTL_MS)),
    });

    // Best-effort only — see CloudTransport's own doc comment. Polling
    // already delivers this command correctly with no transport at all.
    await this.transport.notifyMachine(input.machineId, id);

    return { commandId: id, commandRef };
  }

  /** The device-facing poll route's read — every pending command this machine hasn't acknowledged yet. */
  async listPendingForMachine(businessId: string, machineId: string): Promise<{ id: string; data: MachineCommand }[]> {
    return machineCommandRepository.listPendingByMachine(businessId, machineId);
  }

  /**
   * A device confirming receipt, before it executes anything — the
   * step that turns "we wrote this down" into "the machine has seen
   * it". `machineId` is always the *authenticated* device's own id
   * (never trusted from a request body) — a command belonging to a
   * different machine is reported not-found, the same way a device
   * probing another machine's transaction id already is
   * (`GET /api/vending/payments/[id]`), rather than a distinguishable
   * 403 that would confirm the id exists at all. Checked against the
   * command's own `expiresAt` here, not at read time (see the
   * repository's own comment on why): a command a gateway only got
   * around to acknowledging after it went stale is moved straight to
   * `expired` and refused, rather than acknowledged and executed late.
   */
  async acknowledge(businessId: string, commandId: string, machineId: string): Promise<MachineCommand> {
    const command = await machineCommandRepository.findById(businessId, commandId);
    if (!command || command.machineId !== machineId) {
      throw new MachineCommandNotFoundError(commandId);
    }
    if (command.expiresAt.toMillis() < Date.now()) {
      await machineCommandRepository.moveStatus(businessId, commandId, 'expired');
      throw new CommandExpiredError(command.commandRef);
    }
    await machineCommandRepository.moveStatus(businessId, commandId, 'acknowledged');
    const updated = await machineCommandRepository.findById(businessId, commandId);
    return updated!;
  }

  /** A device's own report of what happened, applied verbatim — never inferred from anything else. Same ownership check as `acknowledge`. */
  async complete(businessId: string, commandId: string, machineId: string, result: { success: boolean; error?: string | null }): Promise<void> {
    const command = await machineCommandRepository.findById(businessId, commandId);
    if (!command || command.machineId !== machineId) {
      throw new MachineCommandNotFoundError(commandId);
    }
    await machineCommandRepository.moveStatus(businessId, commandId, result.success ? 'completed' : 'failed', {
      error: result.success ? null : (result.error ?? 'unknown error'),
    });
  }

  /** The admin detail page's own read — a machine's full command history. */
  async listHistoryForMachine(
    businessId: string,
    machineId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ commands: { id: string; data: MachineCommand }[]; nextCursor: string | null }> {
    return machineCommandRepository.listByMachine(businessId, machineId, options);
  }

  /**
   * The cron's own sweep — a `pending`/`acknowledged` command whose
   * `updatedAt` sat past the threshold with nothing ever moving it
   * further. Mirrors `MachineTransactionService.reconcileStuckTransactions`
   * exactly: a machine that never called back in, never acknowledged,
   * or acknowledged and then vanished, all look the same from here —
   * `expired`, for a human to notice on the admin page rather than a
   * command silently waiting forever.
   */
  async reconcileStuckCommands(businessId: string, stuckAfterMs = DEFAULT_COMMAND_TTL_MS): Promise<{ expired: number }> {
    const before = new Date(Date.now() - stuckAfterMs);
    let expired = 0;
    for (const status of ['pending', 'acknowledged'] as const) {
      const stuck = await machineCommandRepository.listByStatusUpdatedBefore(businessId, status, before);
      for (const { id } of stuck) {
        await machineCommandRepository.moveStatus(businessId, id, 'expired');
        expired += 1;
      }
    }
    return { expired };
  }
}

export const machineCommandService = new MachineCommandService();
export { MachineCommandService };
