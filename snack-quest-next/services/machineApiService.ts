import 'server-only';

import { machineRepository } from '@/repositories/machineRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineCommandRepository, MachineCommandNotFoundError } from '@/repositories/machineCommandRepository';
import { machineDispenseCommandRepository, DispenseCommandNotFoundError } from '@/repositories/machineDispenseCommandRepository';
import { machineEventService } from '@/services/machineEventService';
import { machineInventorySyncService } from '@/services/machineInventorySyncService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { machineTransactionService } from '@/services/machineTransactionService';
import { dispenseCommandService } from '@/services/dispenseCommandService';
import { machineCommandService, CommandExpiredError } from '@/services/machineCommandService';
import { manufacturerSlotIdFor } from '@/lib/vending/slotMapping';
import { API_VERSION, ContractViolationError, type MachineApiContext } from '@/lib/vending/v1/machineApi';
import { DISPENSE_EVENT_TYPES, type CommandStatusBody } from '@/lib/vending/v1/schemas';
import type { DispenseResultStatus, VendResultReport } from '@/lib/vending/hardwareAdapter';
import type { IntegrationCredential, Machine, MachineIntegration } from '@/types';
import type { z } from 'zod';
import type { connectSchema, eventsSchema, heartbeatSchema, inventorySchema, statusSchema } from '@/lib/vending/v1/schemas';

/** How often a machine should poll for commands and send heartbeats — advisory, returned in the machine description so it can change without a firmware update. */
const RECOMMENDED_POLL_SECONDS = 10;
const RECOMMENDED_HEARTBEAT_SECONDS = 60;

export class MachineNotProvisionedError extends Error {
  constructor(manufacturerMachineId: string) {
    super(`No Snack Quest machine is registered for manufacturer machine id "${manufacturerMachineId}" in this environment`);
    this.name = 'MachineNotProvisionedError';
  }
}

export interface MachineDescription {
  machineCode: string;
  integrationState: MachineIntegration['state'] | 'unregistered';
  environment: MachineIntegration['environment'] | null;
  apiVersion: string;
  capabilities: string[];
  slots: { slotId: string; priceKes: number; enabled: boolean; capacity: number }[];
  pollIntervalSeconds: number;
  heartbeatIntervalSeconds: number;
}

/**
 * The operations behind the Snack Quest Machine API v1 (§ MODEL B —
 * MANUFACTURER CONSUMES SNACK QUEST API). Routes authenticate and parse;
 * this translates the external contract onto the same internal services
 * every other channel uses — events through `machineEventService`,
 * outcomes through `machineTransactionService.applyVendReport`, commands
 * through the dispense ledger. Nothing here is a second implementation
 * of any business rule.
 */
class MachineApiService {
  /**
   * A manufacturer connecting a unit Snack Quest has already
   * registered. Never creates a machine: which machines exist, who owns
   * them and where they stand is Snack Quest's decision, made by staff
   * in the admin console — a manufacturer can only claim a machine that
   * was pre-registered under its own identity, in its own environment.
   */
  async connect(
    businessId: string,
    credential: IntegrationCredential,
    body: z.infer<typeof connectSchema>,
    requestId: string,
  ): Promise<MachineDescription> {
    const integration = await machineIntegrationRepository.findByManufacturerMachineId(businessId, credential.manufacturerId, body.manufacturerMachineId);
    if (!integration || integration.environment !== credential.environment) {
      throw new MachineNotProvisionedError(body.manufacturerMachineId);
    }
    const machine = await machineRepository.findById(businessId, integration.machineId);
    if (!machine) {
      throw new MachineNotProvisionedError(body.manufacturerMachineId);
    }
    await machineIntegrationRepository.updateFirmware(integration.machineId, {
      firmwareVersion: body.firmwareVersion,
      controllerType: body.controllerType,
      controllerVersion: body.controllerVersion,
      integrationVersion: body.integrationVersion,
    });
    await machineIntegrationRepository.recordSignal(integration.machineId, 'api_request');
    await machineEventService.record(
      {
        businessId,
        machineId: integration.machineId,
        type: 'MACHINE_ONLINE',
        source: 'v1_api',
        dedupeKey: `v1:connect:${requestId}`,
        data: {
          firmwareVersion: body.firmwareVersion ?? null,
          reportedSerialNumber: body.serialNumber ?? null,
          serialNumberMatches: body.serialNumber ? body.serialNumber === machine.serialNumber : null,
        },
      },
      machine,
    );
    return this.describe(businessId, { ...machine, id: integration.machineId }, integration);
  }

  async describe(businessId: string, machine: Machine & { id: string }, integration: MachineIntegration | null): Promise<MachineDescription> {
    const [slots, { statuses }] = await Promise.all([
      machineSlotRepository.listByMachine(businessId, machine.id),
      machineIntegrationService.capabilitiesFor(businessId, machine),
    ]);
    return {
      machineCode: machine.machineCode,
      integrationState: integration?.state ?? 'unregistered',
      environment: integration?.environment ?? null,
      apiVersion: API_VERSION,
      capabilities: statuses.filter((entry) => entry.status === 'supported').map((entry) => entry.capability),
      slots: slots
        .sort((a, b) => a.position - b.position)
        .map((slot) => ({ slotId: manufacturerSlotIdFor(slot), priceKes: slot.priceKes, enabled: slot.enabled, capacity: slot.capacity })),
      pollIntervalSeconds: RECOMMENDED_POLL_SECONDS,
      heartbeatIntervalSeconds: RECOMMENDED_HEARTBEAT_SECONDS,
    };
  }

  async heartbeat(context: MachineApiContext, body: z.infer<typeof heartbeatSchema>): Promise<{ accepted: boolean }> {
    const { isNew } = await machineEventService.record(
      {
        businessId: context.businessId,
        machineId: context.machine.id,
        type: 'HEARTBEAT_RECEIVED',
        source: 'v1_api',
        dedupeKey: `v1:${body.eventId}`,
        deviceTimestamp: body.occurredAt,
        data: body.uptimeSeconds === undefined ? {} : { uptimeSeconds: body.uptimeSeconds },
      },
      context.machine,
    );
    return { accepted: isNew };
  }

  /** A full status snapshot. Stored as the machine's last reported state (what an inbound-only adapter answers status questions from) and translated into events — one per fault, one for a payment-device problem. */
  async status(context: MachineApiContext, body: z.infer<typeof statusSchema>): Promise<{ accepted: boolean }> {
    const { isNew } = await machineEventService.record(
      {
        businessId: context.businessId,
        machineId: context.machine.id,
        type: 'STATUS_REPORTED',
        source: 'v1_api',
        dedupeKey: `v1:${body.eventId}`,
        deviceTimestamp: body.occurredAt,
        data: { online: body.online, doorOpen: body.doorOpen ?? null, temperatureCelsius: body.temperatureCelsius ?? null, faultCount: body.faults?.length ?? 0 },
      },
      context.machine,
    );
    if (!isNew) {
      return { accepted: false };
    }
    await machineIntegrationRepository.setLastReportedStatus(context.machine.id, {
      online: body.online,
      doorOpen: body.doorOpen ?? null,
      temperatureCelsius: body.temperatureCelsius ?? null,
      faults: body.faults ?? [],
      paymentDeviceOk: body.paymentDeviceOk ?? null,
    });
    for (const code of body.faults ?? []) {
      await machineEventService.record(
        { businessId: context.businessId, machineId: context.machine.id, type: 'MACHINE_ERROR', source: 'v1_api', dedupeKey: `v1:${body.eventId}:fault:${code}`, deviceTimestamp: body.occurredAt, nativeType: code, data: { code } },
        context.machine,
      );
    }
    if (body.paymentDeviceOk === false) {
      await machineEventService.record(
        { businessId: context.businessId, machineId: context.machine.id, type: 'PAYMENT_DEVICE_ERROR', source: 'v1_api', dedupeKey: `v1:${body.eventId}:payment-device`, deviceTimestamp: body.occurredAt },
        context.machine,
      );
    }
    return { accepted: true };
  }

  async inventory(context: MachineApiContext, body: z.infer<typeof inventorySchema>) {
    const result = await machineInventorySyncService.sync({
      businessId: context.businessId,
      machineId: context.machine.id,
      reports: body.slots.map((slot) => ({ manufacturerSlotId: slot.slotId, quantity: slot.quantity })),
      reportId: `v1:${body.reportId}`,
      source: 'v1_api',
      deviceTimestamp: body.occurredAt,
    });
    // Translate back to the caller's own slot names — they never see Snack Quest slot codes.
    const slots = await machineSlotRepository.listByMachine(context.businessId, context.machine.id);
    const external = (slotCode: string) => {
      const slot = slots.find((candidate) => candidate.slotCode === slotCode);
      return slot ? manufacturerSlotIdFor(slot) : slotCode;
    };
    return {
      slotsReported: result.slotsReported,
      mismatches: result.mismatches.map((mismatch) => ({ slotId: external(mismatch.slotCode), expected: mismatch.expected, reported: mismatch.reported })),
      unmappedSlots: result.unmappedSlots,
    };
  }

  async events(context: MachineApiContext, body: z.infer<typeof eventsSchema>) {
    const moneyMoving = body.events.filter((event) => DISPENSE_EVENT_TYPES.includes(event.type.trim().toUpperCase()));
    if (moneyMoving.length > 0) {
      throw new ContractViolationError(
        'dispense_events_not_accepted_here',
        'Dispense outcomes move money and inventory and must be reported through POST /api/v1/machines/{machineCode}/commands/{commandId}/status, not as generic events.',
      );
    }
    return machineEventService.recordExternal(
      context.businessId,
      context.machine,
      body.events.map((event) => ({
        type: event.type,
        eventId: event.eventId,
        occurredAt: event.occurredAt ?? null,
        manufacturerSlotId: event.slotId ?? null,
        data: event.data ?? {},
      })),
      'v1_api',
      'v1',
    );
  }

  /** Everything this machine should act on now — queued dispenses first (a customer is waiting), then maintenance commands. */
  async listCommands(context: MachineApiContext) {
    const [dispenses, generic] = await Promise.all([
      dispenseCommandService.listQueuedForMachine(context.businessId, context.machine.id),
      machineCommandService.listPendingForMachine(context.businessId, context.machine.id),
    ]);
    const now = Date.now();
    return {
      commands: [
        ...dispenses.map((command) => ({
          commandId: command.commandRef,
          type: 'dispense' as const,
          slotId: command.manufacturerSlotId ?? command.slotCode,
          quantity: command.quantity,
          issuedAt: command.createdAt.toDate().toISOString(),
          expiresAt: command.expiresAt.toDate().toISOString(),
        })),
        ...generic
          .filter(({ data }) => data.expiresAt.toMillis() > now)
          .map(({ data }) => ({
            commandId: data.commandRef,
            type: data.commandType,
            payload: data.payload,
            issuedAt: data.createdAt.toDate().toISOString(),
            expiresAt: data.expiresAt.toDate().toISOString(),
          })),
      ],
    };
  }

  async acknowledgeCommand(context: MachineApiContext, commandId: string): Promise<{ commandId: string; status: string }> {
    if (commandId.startsWith('DSP-')) {
      const command = await dispenseCommandService.recordProgress(context.businessId, context.machine.id, commandId, 'acknowledged');
      return { commandId, status: command.status };
    }
    const generic = await this.requireGenericCommand(context, commandId);
    try {
      const updated = await machineCommandService.acknowledge(context.businessId, generic.id, context.machine.id);
      return { commandId, status: updated.status };
    } catch (error) {
      if (error instanceof CommandExpiredError) {
        throw new ContractViolationError('command_expired', 'This command expired before it was acknowledged and must not be executed', 409);
      }
      throw error;
    }
  }

  /**
   * A machine's report of what happened to a command. For a dispense,
   * this is the money-moving path: `dispensed` consumes inventory and
   * completes the sale; `failed` sends the customer down the refund
   * path; `unknown` goes to a human. All three go through the same
   * `applyVendReport` every other channel uses, keyed by the caller's
   * `eventId`, so a retried report is a no-op.
   */
  async reportCommandStatus(context: MachineApiContext, commandId: string, body: CommandStatusBody): Promise<{ commandId: string; applied: boolean }> {
    if (!commandId.startsWith('DSP-')) {
      const generic = await this.requireGenericCommand(context, commandId);
      if (body.status !== 'completed' && body.status !== 'failed') {
        throw new ContractViolationError('invalid_status_for_command', `A ${generic.data.commandType} command reports "completed" or "failed"`);
      }
      await machineCommandService.complete(context.businessId, generic.id, context.machine.id, {
        success: body.status === 'completed',
        error: body.status === 'failed' ? (body.failureReason ?? body.failureCode) : null,
      });
      return { commandId, applied: true };
    }

    const command = await machineDispenseCommandRepository.findByCommandRef(context.businessId, commandId);
    if (!command || command.machineId !== context.machine.id) {
      throw new DispenseCommandNotFoundError(commandId);
    }
    if (body.status === 'completed') {
      throw new ContractViolationError('invalid_status_for_command', 'A dispense command reports "dispensing", "dispensed", "failed" or "unknown"');
    }
    if (body.status === 'dispensing') {
      await dispenseCommandService.recordProgress(context.businessId, context.machine.id, commandId, 'dispensing');
      return { commandId, applied: true };
    }

    const status: DispenseResultStatus = body.status === 'dispensed' ? 'success' : body.status === 'unknown' ? 'unknown' : body.failureCode;
    const report: VendResultReport = {
      vendRef: command.vendRef ?? command.commandRef,
      dispensed: status === 'success',
      status,
      failureReason: body.status === 'failed' || body.status === 'unknown' ? (body.failureReason ?? null) : null,
      deviceTimestamp: body.occurredAt ?? null,
      idempotencyKey: `v1:${body.eventId}`,
    };
    const { applied } = await machineTransactionService.applyVendReport({
      businessId: context.businessId,
      machineId: context.machine.id,
      report,
      rawPayload: { commandId, ...body },
      source: 'v1_api',
      actor: `machine:${context.machine.machineCode}`,
    });
    return { commandId, applied };
  }

  private async requireGenericCommand(context: MachineApiContext, commandRef: string) {
    const found = await machineCommandRepository.findByCommandRef(context.businessId, commandRef);
    if (!found || found.data.machineId !== context.machine.id) {
      throw new MachineCommandNotFoundError(commandRef);
    }
    return found;
  }
}

export const machineApiService = new MachineApiService();
export { MachineApiService };
