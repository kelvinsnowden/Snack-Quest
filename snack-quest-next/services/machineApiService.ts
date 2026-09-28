import 'server-only';

import { IllegalDispenseCommandTransitionError } from '@/repositories/machineDispenseCommandRepository';

import { machineRepository } from '@/repositories/machineRepository';
import { machineModelRepository } from '@/repositories/machineModelRepository';
import { machineSlotRepository } from '@/repositories/machineSlotRepository';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineCommandRepository, MachineCommandNotFoundError } from '@/repositories/machineCommandRepository';
import { machineDispenseCommandRepository, DispenseCommandNotFoundError } from '@/repositories/machineDispenseCommandRepository';
import { machineEventService } from '@/services/machineEventService';
import { machineInventorySyncService } from '@/services/machineInventorySyncService';
import { machineIntegrationService } from '@/services/machineIntegrationService';
import { machineTransactionService, type VendReportResult } from '@/services/machineTransactionService';
import { dispenseCommandService } from '@/services/dispenseCommandService';
import { machineCommandService, CommandExpiredError } from '@/services/machineCommandService';
import { manufacturerSlotIdFor } from '@/lib/vending/slotMapping';
import { scopeOf } from '@/lib/vending/credentialLifecycle';
import { deriveMachineLiveness } from '@/lib/vending/machineLiveness';
import { resolveOccurredAt } from '@/lib/vending/machineEvents';
import { API_VERSION, ContractViolationError, type MachineApiContext } from '@/lib/vending/v1/machineApi';
import { DISPENSE_EVENT_TYPES, normalizeFailureCode, type CommandStatusBody } from '@/lib/vending/v1/schemas';
import type { DispenseResultStatus, VendResultReport } from '@/lib/vending/hardwareAdapter';
import type { IntegrationCredential, Machine, MachineEventType, MachineIntegration } from '@/types';
import type { z } from 'zod';
import type { connectSchema, eventsSchema, heartbeatSchema, inventorySchema, statusSchema } from '@/lib/vending/v1/schemas';

/** How often a machine should poll for commands and send heartbeats — advisory, returned in the machine description so it can change without a firmware update. */
const RECOMMENDED_POLL_SECONDS = 10;
const RECOMMENDED_HEARTBEAT_SECONDS = 60;
/** While a customer is paying at this machine, ask it to poll this often. */
const FAST_POLL_SECONDS = 2;
const CONTACT_WRITE_INTERVAL_MS = 30_000;

/** Latest contact of any kind, by Snack Quest's clock. */
export function latestContact(integration: Pick<MachineIntegration, 'signals'>): Date | null {
  const candidates = [integration.signals?.heartbeat, integration.signals?.api_request, integration.signals?.webhook]
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .map((value) => value.toDate());
  return candidates.length === 0 ? null : new Date(Math.max(...candidates.map((date) => date.getTime())));
}

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
    const scope = scopeOf(credential);
    if (scope.type === 'machine' && scope.machineId !== integration.machineId) {
      // A unit's own key can only ever announce that unit.
      throw new MachineNotProvisionedError(body.manufacturerMachineId);
    }
    const machine = await machineRepository.findById(businessId, integration.machineId);
    if (!machine) {
      throw new MachineNotProvisionedError(body.manufacturerMachineId);
    }
    if (body.firmwareVersion && integration.firmwareVersion && body.firmwareVersion !== integration.firmwareVersion) {
      await this.recordFirmwareChange(businessId, { ...machine, id: integration.machineId }, integration, body.firmwareVersion, requestId);
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

  /**
   * Firmware changed since last connect. Recorded as an event (and an
   * alert) — and flagged if the model was certified before the change,
   * because certification was earned by the old firmware.
   */
  private async recordFirmwareChange(businessId: string, machine: Machine & { id: string }, integration: MachineIntegration, firmwareVersion: string, requestId: string): Promise<void> {
    const model = await machineModelRepository.findById(businessId, integration.modelId);
    await machineIntegrationRepository.recordFirmwareChange(integration.machineId, integration.firmwareVersion);
    await machineEventService.record(
      {
        businessId,
        machineId: integration.machineId,
        type: 'FIRMWARE_CHANGED',
        source: 'v1_api',
        dedupeKey: `v1:firmware:${requestId}`,
        data: {
          previousFirmwareVersion: integration.firmwareVersion,
          firmwareVersion,
          certifiedBefore: model?.certificationStatus === 'certified',
        },
      },
      machine,
    );
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

  /**
   * Proof of life. Deliberately *not* stored as an event: at fleet scale
   * heartbeats are the bulk of all traffic, and a sample every minute
   * per machine is liveness data, not history. It updates the
   * integration's contact signal (at most every 30 s) and produces an
   * event only on a *transition* — a machine coming back after being
   * offline or never heard. The response carries `reportOutcomes`: any
   * of this machine's dispenses whose outcome Snack Quest still doesn't
   * know, so a machine that stored its outcomes can resend them.
   */
  async heartbeat(context: MachineApiContext, body: z.infer<typeof heartbeatSchema>): Promise<{ accepted: true; reportOutcomes: { commandId: string; reason: string }[] }> {
    await this.noteContact(context, body.eventId, 'heartbeat');
    const outstanding = await dispenseCommandService.listNeedingOutcome(context.businessId, context.machine.id);
    return {
      accepted: true,
      reportOutcomes: outstanding.map((command) => ({
        commandId: command.commandRef,
        reason: command.status === 'unknown' ? 'outcome_unknown' : command.status === 'timeout' ? 'no_outcome_received' : 'in_progress_too_long',
      })),
    };
  }

  /**
   * A full status snapshot. Stored as the machine's last reported state
   * (what an inbound-only adapter answers status questions from) —
   * unless a snapshot the machine says is newer is already stored, so a
   * late, out-of-order delivery never overwrites fresher state. Events
   * are emitted for *changes* only (door, online, new faults, payment
   * device), each deduplicated by the report's `eventId`.
   */
  async status(context: MachineApiContext, body: z.infer<typeof statusSchema>): Promise<{ accepted: true; applied: boolean }> {
    await this.noteContact(context, body.eventId, 'status');
    const observedAt = resolveOccurredAt(body.occurredAt, new Date());
    const previous = context.integration.lastReportedStatus;
    const next = {
      online: body.online,
      doorOpen: body.doorOpen ?? null,
      temperatureCelsius: body.temperatureCelsius ?? null,
      faults: body.faults ?? [],
      paymentDeviceOk: body.paymentDeviceOk ?? null,
    };
    const stored = await machineIntegrationRepository.setLastReportedStatus(context.machine.id, next, observedAt);
    if (!stored) {
      return { accepted: true, applied: false };
    }
    const emit = (type: MachineEventType, suffix: string, extra: { nativeType?: string; data?: Record<string, unknown> } = {}) =>
      machineEventService.record(
        { businessId: context.businessId, machineId: context.machine.id, type, source: 'v1_api', dedupeKey: `v1:${body.eventId}:${suffix}`, deviceTimestamp: body.occurredAt, ...extra },
        context.machine,
      );
    if (!previous || previous.online !== next.online) {
      if (previous || !next.online) {
        await emit(next.online ? 'MACHINE_ONLINE' : 'MACHINE_OFFLINE', 'online');
      }
    }
    if (next.doorOpen !== null && next.doorOpen !== (previous?.doorOpen ?? null)) {
      await emit(next.doorOpen ? 'DOOR_OPENED' : 'DOOR_CLOSED', 'door');
    }
    const previousFaults = new Set(previous?.faults ?? []);
    for (const code of next.faults.filter((fault) => !previousFaults.has(fault))) {
      await emit('MACHINE_ERROR', `fault:${code}`, { nativeType: code, data: { code } });
    }
    if (next.paymentDeviceOk === false && previous?.paymentDeviceOk !== false) {
      await emit('PAYMENT_DEVICE_ERROR', 'payment-device');
    }
    if (next.temperatureCelsius !== null && next.temperatureCelsius !== previous?.temperatureCelsius) {
      await emit('TEMPERATURE_REPORTED', 'temperature', { data: { temperatureCelsius: next.temperatureCelsius } });
    }
    return { accepted: true, applied: true };
  }

  /**
   * Contact bookkeeping shared by heartbeat and status: the heartbeat
   * signal (throttled — liveness needs ~30 s resolution, not one write
   * per request) and, when this contact ends a period of silence, a
   * MACHINE_ONLINE event.
   */
  private async noteContact(context: MachineApiContext, eventId: string, via: 'heartbeat' | 'status'): Promise<void> {
    const integration = context.integration;
    const now = new Date();
    const before = deriveMachineLiveness({
      lastContactAt: latestContact(integration),
      configuredAt: integration.configuredAt?.toDate() ?? null,
      expectedIntervalSeconds: integration.heartbeatIntervalSeconds,
      now,
    });
    // Only a heartbeat moves the heartbeat signal — a status report is
    // contact (the pipeline's api_request signal keeps liveness fresh), but
    // "does this machine heartbeat?" must stay answerable on its own.
    const lastHeartbeat = integration.signals?.heartbeat?.toMillis() ?? 0;
    if (via === 'heartbeat' && now.getTime() - lastHeartbeat >= CONTACT_WRITE_INTERVAL_MS) {
      await machineIntegrationRepository.recordSignal(context.machine.id, 'heartbeat');
    }
    const lastSeen = context.machine.lastSeenAt?.toMillis?.() ?? 0;
    if (now.getTime() - lastSeen >= 60_000) {
      await machineRepository.updateLastSeen(context.machine.id, null);
    }
    if (before.state === 'OFFLINE' || before.state === 'UNKNOWN') {
      await machineEventService.record(
        {
          businessId: context.businessId,
          machineId: context.machine.id,
          type: 'MACHINE_ONLINE',
          source: 'v1_api',
          dedupeKey: `v1:${eventId}:back-online`,
          data: { after: before.reason, silentSeconds: before.secondsSinceContact },
        },
        context.machine,
      );
    }
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
      stale: result.stale,
      mismatches: result.mismatches.map((mismatch) => ({ slotId: external(mismatch.slotCode), expected: mismatch.expected, reported: mismatch.reported })),
      unmappedSlots: result.unmappedSlots,
    };
  }

  async events(context: MachineApiContext, body: z.infer<typeof eventsSchema>) {
    // Batches are charged per event, so batching can't be used to slip past the event budget.
    await context.charge('event_items', body.events.length);
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

  /**
   * Everything this machine should act on now — queued dispenses first
   * (a customer is waiting), then maintenance commands.
   *
   * Cheap when idle: if nothing queued for this machine can still be
   * unexpired (`commandsQueuedUntil`), the command queries are skipped
   * entirely. `nextPollSeconds` asks for fast polling only while a
   * customer is paying at this machine. Expired, uncollected dispenses
   * found here are resolved on the spot (customer refunded) rather than
   * waiting for a sweep.
   */
  async listCommands(context: MachineApiContext) {
    const now = Date.now();
    const expectOrders = (context.integration.expectOrdersUntil?.toMillis() ?? 0) > now;
    const nextPollSeconds = expectOrders ? FAST_POLL_SECONDS : RECOMMENDED_POLL_SECONDS;
    // Nothing has been queued for this machine that could still be live
    // (never, or everything queued has expired): skip the queries. The
    // marker is written *before* any command is created, so it can only
    // over-report. Expired-but-uncollected dispenses are still refunded —
    // by the recovery sweep rather than this poll.
    // Server time lets a machine with a wrong clock judge `expiresAt` correctly.
    const serverTime = new Date(now).toISOString();
    const queuedUntil = context.integration.commandsQueuedUntil?.toMillis() ?? 0;
    if (queuedUntil < now - 30_000 && !expectOrders) {
      return { commands: [], nextPollSeconds, serverTime };
    }
    await dispenseCommandService.expireUncollectedForMachine(context.businessId, context.machine.id);
    const [dispenses, generic] = await Promise.all([
      dispenseCommandService.listQueuedForMachine(context.businessId, context.machine.id),
      machineCommandService.listPendingForMachine(context.businessId, context.machine.id),
    ]);
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
      nextPollSeconds,
      serverTime,
    };
  }

  async acknowledgeCommand(context: MachineApiContext, commandId: string): Promise<{ commandId: string; status: string }> {
    if (commandId.startsWith('DSP-')) {
      try {
        const { command } = await dispenseCommandService.recordProgress(context.businessId, context.machine.id, commandId, 'acknowledged');
        return { commandId, status: command.status };
      } catch (error) {
        // Collected too late (now, or already expired by a sweep): say so precisely.
        if (error instanceof IllegalDispenseCommandTransitionError && error.from === 'timeout') {
          const command = await dispenseCommandService.findOwnedCommand(context.businessId, context.machine.id, commandId);
          if (command?.failureCode === 'business.command_expired') {
            throw new ContractViolationError('command_expired', 'This dispense expired before it was acknowledged and must not be executed; the customer has been refunded', 409);
          }
        }
        throw error;
      }
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
  async reportCommandStatus(context: MachineApiContext, commandId: string, body: CommandStatusBody): Promise<{ commandId: string; applied: boolean; result: VendReportResult | 'progress_recorded' | 'stale_progress' }> {
    if (!commandId.startsWith('DSP-')) {
      const generic = await this.requireGenericCommand(context, commandId);
      if (body.status !== 'completed' && body.status !== 'failed') {
        throw new ContractViolationError('invalid_status_for_command', `A ${generic.data.commandType} command reports "completed" or "failed"`);
      }
      await machineCommandService.complete(context.businessId, generic.id, context.machine.id, {
        success: body.status === 'completed',
        error: body.status === 'failed' ? (body.failureReason ?? body.failureCode) : null,
      });
      return { commandId, applied: true, result: 'applied' };
    }

    const command = await machineDispenseCommandRepository.findByCommandRef(context.businessId, commandId);
    if (!command || command.machineId !== context.machine.id) {
      throw new DispenseCommandNotFoundError(commandId);
    }
    if (body.status === 'completed') {
      throw new ContractViolationError('invalid_status_for_command', 'A dispense command reports "dispensing", "dispensed", "failed" or "unknown"');
    }
    if (body.status === 'dispensing') {
      const progress = await dispenseCommandService.recordProgress(context.businessId, context.machine.id, commandId, 'dispensing');
      return progress.stale ? { commandId, applied: false, result: 'stale_progress' } : { commandId, applied: progress.changed, result: 'progress_recorded' };
    }

    const failure = body.status === 'failed' ? normalizeFailureCode(body.failureCode) : null;
    const status: DispenseResultStatus = body.status === 'dispensed' ? 'success' : body.status === 'unknown' ? 'unknown' : failure!.code;
    const reason = body.status === 'failed' || body.status === 'unknown' ? (body.failureReason ?? null) : null;
    const report: VendResultReport = {
      vendRef: command.vendRef ?? command.commandRef,
      dispensed: status === 'success',
      status,
      failureReason: failure?.native ? `[${failure.native}] ${reason ?? ''}`.trim() : reason,
      deviceTimestamp: body.occurredAt ?? null,
      idempotencyKey: `v1:${body.eventId}`,
    };
    const { applied, result } = await machineTransactionService.applyVendReport({
      businessId: context.businessId,
      machineId: context.machine.id,
      report,
      rawPayload: { commandId, requestId: context.requestId, ...body },
      source: 'v1_api',
      actor: `machine:${context.machine.machineCode}`,
    });
    return { commandId, applied, result };
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
