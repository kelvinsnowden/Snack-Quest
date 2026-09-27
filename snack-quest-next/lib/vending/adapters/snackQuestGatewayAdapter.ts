import 'server-only';

import { randomUUID } from 'node:crypto';
import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import { machineDispenseCommandRepository } from '@/repositories/machineDispenseCommandRepository';
import {
  ProtocolNotConfiguredError,
  UnrecognisedHardwarePayloadError,
  type ConnectionTestResult,
  type DispenseResultStatus,
  type DispenseStatusReport,
  type MachineInfoReport,
  type PaymentDeviceStatusReport,
  type VendAuthorizationOptions,
  type VendAuthorizationResult,
  type VendResultReport,
  type VendingHardwareAdapter,
  type VendingMachineStatusReport,
  type VendingSlotReport,
  type VendingTelemetryReport,
} from '../hardwareAdapter';
import type { HardwareCapabilities } from '../protocol/capabilities';
import { livenessOfIntegration as livenessOf } from '../machineLiveness';
import type { MachineDispenseCommand, MachineIntegration } from '@/types';

const ADAPTER_KEY = 'snack_quest_gateway';
/** No contact from the machine for this long and it is treated as offline — a queued dispense would wait for a machine that isn't polling. */
const OFFLINE_AFTER_MS = 15 * 60 * 1000;

const DISPENSE_RESULT_STATUSES: DispenseResultStatus[] = ['success', 'failed', 'timeout', 'unknown', 'jam', 'no_product', 'sensor_failure', 'machine_offline'];

/** What the adapter reads from Snack Quest's own records — injectable so tests can drive it without Firestore. */
export interface GatewayStateStore {
  integration(machineId: string): Promise<MachineIntegration | null>;
  command(machineId: string, commandRef: string): Promise<MachineDispenseCommand | null>;
}

const firestoreStore: GatewayStateStore = {
  integration: (machineId) => machineIntegrationRepository.findForAdapter(machineId),
  command: (machineId, commandRef) => machineDispenseCommandRepository.findForMachine(machineId, commandRef),
};

function lastContactMs(integration: MachineIntegration | null): number | null {
  if (!integration) {
    return null;
  }
  const times = [integration.signals.heartbeat, integration.signals.api_request, integration.signals.webhook]
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .map((value) => value.toMillis());
  return times.length > 0 ? Math.max(...times) : null;
}

/**
 * The adapter for machines whose manufacturer builds against the Snack
 * Quest Machine API (§ MODEL B — "give us your API documentation").
 *
 * Inverted relative to every outbound adapter: Snack Quest never calls
 * these machines. The machine polls `/api/v1/machines/{code}/commands`,
 * reports through `/status`, `/inventory`, `/events` and
 * `/commands/{id}/status`, and this adapter answers the business layer's
 * questions from what the machine last reported:
 *
 * - `authorizeVend` does not reach the machine — it returns `queued`,
 *   and the dispense command ledger holds the instruction for the
 *   machine's next poll. It refuses up front if the machine hasn't been
 *   heard from recently, so a paid customer is refunded rather than
 *   waiting on a machine that isn't polling.
 * - Status, temperature, door, faults and payment device come from the
 *   last `/status` report — stale data is returned as reported, and the
 *   report's own timestamp says how old it is.
 * - Slot quantities are never read back from the machine here: they
 *   arrive as inventory reports and are compared against the ledger.
 *
 * Capabilities are what the v1 contract can carry; a specific model's
 * declaration narrows them (`effectiveCapabilities`).
 */
export class SnackQuestGatewayAdapter implements VendingHardwareAdapter {
  readonly manufacturer = ADAPTER_KEY;

  constructor(private readonly store: GatewayStateStore = firestoreStore) {}

  capabilities(): HardwareCapabilities {
    return {
      vend: true,
      dispense_confirmation: true,
      inventory_read: true,
      heartbeat: true,
      telemetry: true,
      faults: true,
      temperature: true,
      door_status: true,
      remote_restart: true,
      payment_device: true,
      camera: true,
    };
  }

  /**
   * Queues a dispense only for a machine that can collect it: ONLINE and
   * heard from within `ORDER_FRESHNESS_SECONDS` (lib/vending/machineLiveness.ts),
   * comfortably inside the queued command's 2-minute life. Anything else
   * is refused, so the customer is refunded at once rather than after
   * the command expires.
   */
  async authorizeVend(machineId: string, _slotCode: string, options: VendAuthorizationOptions = {}): Promise<VendAuthorizationResult> {
    const vendRef = options.commandRef ?? `sqg-${randomUUID()}`;
    const liveness = livenessOf(await this.store.integration(machineId));
    if (!liveness.canAcceptOrders) {
      return { vendRef, authorized: false, reason: `machine cannot collect a dispense right now (${liveness.state.toLowerCase()}: ${liveness.reason.replace(/_/g, ' ')})` };
    }
    return { vendRef, authorized: true, reason: null, delivery: 'queued' };
  }

  /** The inbound TEST: Snack Quest can't call the machine, so "connected" means "the machine has recently called us". */
  async testConnection(machineId: string): Promise<ConnectionTestResult> {
    const contact = lastContactMs(await this.store.integration(machineId));
    if (contact === null) {
      return { ok: false, detail: 'The machine has not contacted the Snack Quest Machine API yet. Have it call POST /api/v1/machines/connect and send a heartbeat, then test again.', latencyMs: null, errorKind: 'connection' };
    }
    const ageMs = Date.now() - contact;
    if (ageMs > OFFLINE_AFTER_MS) {
      return { ok: false, detail: `Last contact from the machine was ${Math.round(ageMs / 60000)} minutes ago.`, latencyMs: null, errorKind: 'connection' };
    }
    return { ok: true, detail: `Machine last contacted Snack Quest ${Math.round(ageMs / 1000)} seconds ago.`, latencyMs: null, errorKind: null };
  }

  async getMachineStatus(machineId: string): Promise<VendingMachineStatusReport> {
    const reported = (await this.store.integration(machineId))?.lastReportedStatus;
    return {
      machineId,
      online: reported?.online ?? false,
      doorOpen: reported?.doorOpen ?? null,
      temperatureCelsius: reported?.temperatureCelsius ?? null,
      faults: reported?.faults ?? [],
      reportedAt: reported ? reported.reportedAt.toDate().toISOString() : new Date(0).toISOString(),
    };
  }

  async getMachineInfo(machineId: string): Promise<MachineInfoReport> {
    const integration = await this.store.integration(machineId);
    return {
      manufacturerMachineId: integration?.manufacturerMachineId ?? null,
      serialNumber: null,
      model: null,
      firmwareVersion: integration?.firmwareVersion ?? null,
      controllerType: integration?.controllerType ?? null,
      controllerVersion: integration?.controllerVersion ?? null,
    };
  }

  /** The machine reports outcomes to us; this reads the dispense ledger those reports were applied to. */
  async getDispenseStatus(machineId: string, vendRef: string): Promise<DispenseStatusReport> {
    const command = await this.store.command(machineId, vendRef);
    if (!command) {
      return { vendRef, state: 'unknown', failureReason: 'no such command for this machine' };
    }
    switch (command.status) {
      case 'dispensed':
        return { vendRef, state: 'success', failureReason: null };
      case 'dispensing':
        return { vendRef, state: 'dispensing', failureReason: null };
      case 'failed':
      case 'rejected':
        return { vendRef, state: command.dispenseResultStatus && command.dispenseResultStatus !== 'success' ? command.dispenseResultStatus : 'failed', failureReason: command.failureReason };
      case 'timeout':
      case 'unknown':
        return { vendRef, state: 'unknown', failureReason: command.failureReason };
      default:
        return { vendRef, state: 'pending', failureReason: null };
    }
  }

  async getTemperature(machineId: string): Promise<number | null> {
    return (await this.store.integration(machineId))?.lastReportedStatus?.temperatureCelsius ?? null;
  }

  async getFaults(machineId: string): Promise<string[]> {
    return (await this.store.integration(machineId))?.lastReportedStatus?.faults ?? [];
  }

  async getDoorStatus(machineId: string): Promise<'open' | 'closed' | null> {
    const doorOpen = (await this.store.integration(machineId))?.lastReportedStatus?.doorOpen;
    return doorOpen === undefined || doorOpen === null ? null : doorOpen ? 'open' : 'closed';
  }

  async getPaymentDeviceStatus(machineId: string): Promise<PaymentDeviceStatusReport> {
    const ok = (await this.store.integration(machineId))?.lastReportedStatus?.paymentDeviceOk;
    return ok === undefined || ok === null ? { present: false, ok: null, detail: 'not reported' } : { present: true, ok, detail: null };
  }

  async getSlots(): Promise<VendingSlotReport[]> {
    throw new ProtocolNotConfiguredError(ADAPTER_KEY, 'getSlots — inbound machines report inventory via POST /api/v1/machines/{code}/inventory');
  }

  async getInventory(): Promise<{ quantity: number | null }> {
    throw new ProtocolNotConfiguredError(ADAPTER_KEY, 'getInventory — inbound machines report inventory via POST /api/v1/machines/{code}/inventory');
  }

  /**
   * Price and enabled state are published to the machine through
   * `GET /api/v1/machines/{code}`, which reads Snack Quest's own slot
   * records — so the slot service's own write already *is* the delivery.
   * Nothing to push; resolving (rather than throwing) keeps slot
   * configuration working for these machines. Not declared as a remote
   * capability, because when the machine picks it up is the machine's
   * decision.
   */
  async setPrice(): Promise<void> {}

  async enableSlot(): Promise<void> {}

  async disableSlot(): Promise<void> {}

  /** The canonical v1 dispense outcome, for the legacy `/api/vending/transactions` channel: `{ vendRef, status, failureReason?, occurredAt?, eventId }`. */
  receiveVendResult(rawPayload: unknown): VendResultReport {
    const payload = asRecord(rawPayload);
    const vendRef = requireString(payload, 'vendRef');
    const eventId = requireString(payload, 'eventId');
    const status = payload.status;
    if (typeof status !== 'string' || !DISPENSE_RESULT_STATUSES.includes(status as DispenseResultStatus)) {
      throw new UnrecognisedHardwarePayloadError(ADAPTER_KEY, `"status" must be one of ${DISPENSE_RESULT_STATUSES.join(', ')}`);
    }
    return {
      vendRef,
      dispensed: status === 'success',
      status: status as DispenseResultStatus,
      failureReason: typeof payload.failureReason === 'string' ? payload.failureReason : null,
      deviceTimestamp: typeof payload.occurredAt === 'string' ? payload.occurredAt : null,
      idempotencyKey: `gateway:${eventId}`,
    };
  }

  /** The legacy telemetry channel's shape — kept so an inbound machine can still use `/api/vending/telemetry`. */
  receiveTelemetry(rawPayload: unknown): VendingTelemetryReport {
    const payload = asRecord(rawPayload);
    return {
      machineId: requireString(payload, 'machineId'),
      eventType: requireString(payload, 'eventType'),
      payload: typeof payload.payload === 'object' && payload.payload !== null ? (payload.payload as Record<string, unknown>) : {},
      deviceTimestamp: typeof payload.deviceTimestamp === 'string' ? payload.deviceTimestamp : null,
      idempotencyKey: requireString(payload, 'idempotencyKey'),
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new UnrecognisedHardwarePayloadError(ADAPTER_KEY, 'payload is not an object');
  }
  return value as Record<string, unknown>;
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || !value) {
    throw new UnrecognisedHardwarePayloadError(ADAPTER_KEY, `missing or non-string "${key}"`);
  }
  return value;
}
