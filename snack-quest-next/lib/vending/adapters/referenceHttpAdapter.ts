import 'server-only';

import { machineIntegrationRepository } from '@/repositories/machineIntegrationRepository';
import {
  HardwareTimeoutError,
  HardwareUnreachableError,
  ProtocolNotConfiguredError,
  UnrecognisedHardwarePayloadError,
  type AdapterMachineEvent,
  type ConnectionTestResult,
  type DispenseResultStatus,
  type DispenseStatusReport,
  type MachineInfoReport,
  type ParsedWebhook,
  type PaymentDeviceStatusReport,
  type VendAuthorizationOptions,
  type VendAuthorizationResult,
  type VendResultReport,
  type VendingHardwareAdapter,
  type VendingMachineStatusReport,
  type VendingSlotReport,
  type VendingTelemetryReport,
} from '../hardwareAdapter';
import { NO_CAPABILITIES, type HardwareCapabilities } from '../protocol/capabilities';
import { ManufacturerHttpClient, type FetchLike } from './manufacturerHttpClient';

const ADAPTER_KEY = 'reference_http';

/**
 * The reference manufacturer's native webhook vocabulary → Snack Quest
 * events. This table *is* the translation layer the brief asks for: a
 * real adapter's version of it is most of the work of integrating a new
 * manufacturer's events.
 */
const NATIVE_EVENT_TYPES: Record<string, string> = {
  heartbeat: 'HEARTBEAT_RECEIVED',
  'machine.online': 'MACHINE_ONLINE',
  'machine.offline': 'MACHINE_OFFLINE',
  'door.open': 'DOOR_OPENED',
  'door.closed': 'DOOR_CLOSED',
  fault: 'MACHINE_ERROR',
  'temperature.alarm': 'TEMPERATURE_ALERT',
  'slot.empty': 'SLOT_EMPTY',
  'slot.low': 'SLOT_LOW',
  'payment.error': 'PAYMENT_DEVICE_ERROR',
  'camera.offline': 'CAMERA_OFFLINE',
  'vend.completed': 'DISPENSE_SUCCESS',
  'vend.failed': 'DISPENSE_FAILED',
};

const NATIVE_FAILURE_CODES: Record<string, DispenseResultStatus> = {
  jam: 'jam',
  empty: 'no_product',
  sensor: 'sensor_failure',
  timeout: 'timeout',
  offline: 'machine_offline',
};

export interface ReferenceHttpAdapterConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  retryDelaysMs?: number[];
  /** Snack Quest machine id → the manufacturer's own id for it. Defaults to the integration record. */
  resolveManufacturerMachineId?: (machineId: string) => Promise<string | null>;
}

/**
 * A **reference** outbound adapter (§ MODEL A), built against the small
 * example contract documented in docs/MACHINE_INTEGRATION_LAYER.md §6
 * ("Reference Manufacturer API"). It is not an integration with any
 * real manufacturer and is registered sandbox-only: it exists to prove
 * — against a fake server in the tests — every mechanism a real
 * HTTP-API adapter needs, so the first real one is a copy-and-adapt:
 *
 * - translating Snack Quest machine ids to the manufacturer's own;
 * - an idempotent vend addressed by Snack Quest's command reference
 *   (`PUT /v1/machines/{id}/vends/{commandRef}`), so a retry can never
 *   dispense twice and a timed-out vend can be looked up afterwards;
 * - failure classification (unreachable → refund-safe, timeout →
 *   unknown, 401/403 → authentication) via `ManufacturerHttpClient`;
 * - native webhook events translated into Snack Quest's vocabulary.
 *
 * Without a base URL and key it reports every capability false and
 * refuses every call — the same honest "not configured" posture as the
 * Shengma stub.
 */
export class ReferenceHttpAdapter implements VendingHardwareAdapter {
  readonly manufacturer = ADAPTER_KEY;
  private readonly client: ManufacturerHttpClient | null;
  private readonly resolveManufacturerMachineId: (machineId: string) => Promise<string | null>;

  constructor(config: ReferenceHttpAdapterConfig | null) {
    this.client = config?.baseUrl && config.apiKey
      ? new ManufacturerHttpClient({ adapterKey: ADAPTER_KEY, baseUrl: config.baseUrl, apiKey: config.apiKey, timeoutMs: config.timeoutMs, fetchImpl: config.fetchImpl, retryDelaysMs: config.retryDelaysMs })
      : null;
    this.resolveManufacturerMachineId =
      config?.resolveManufacturerMachineId ?? (async (machineId) => (await machineIntegrationRepository.findForAdapter(machineId))?.manufacturerMachineId ?? null);
  }

  capabilities(): HardwareCapabilities {
    if (!this.client) {
      return NO_CAPABILITIES;
    }
    return {
      vend: true,
      dispense_confirmation: true,
      heartbeat: true,
      telemetry: true,
      faults: true,
      temperature: true,
      door_status: true,
      payment_device: true,
    };
  }

  async testConnection(machineId: string): Promise<ConnectionTestResult> {
    if (!this.client) {
      return { ok: false, detail: 'Reference manufacturer API is not configured (base URL and API key).', latencyMs: null, errorKind: 'protocol' };
    }
    const startedAt = Date.now();
    try {
      const path = await this.machinePath(machineId);
      const { status } = await this.client.request('GET', path);
      if (status === 404) {
        return { ok: false, detail: 'The manufacturer API does not know this machine id — check the integration’s manufacturer machine id.', latencyMs: Date.now() - startedAt, errorKind: 'protocol' };
      }
      if (status >= 400) {
        return { ok: false, detail: `Manufacturer API answered HTTP ${status}.`, latencyMs: Date.now() - startedAt, errorKind: 'connection' };
      }
      return { ok: true, detail: 'Manufacturer API reached and recognised this machine.', latencyMs: Date.now() - startedAt, errorKind: null };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      return {
        ok: false,
        detail: error instanceof Error ? error.message : 'connection test failed',
        latencyMs: Date.now() - startedAt,
        errorKind: name === 'HardwareAuthenticationError' ? 'authentication' : name === 'HardwareTimeoutError' ? 'timeout' : 'connection',
      };
    }
  }

  async authorizeVend(machineId: string, slotCode: string, options: VendAuthorizationOptions = {}): Promise<VendAuthorizationResult> {
    const client = this.requireClient('authorizeVend');
    if (!options.commandRef) {
      // Without our own reference the vend could not be made idempotent — refuse rather than risk a double dispense.
      return { vendRef: '', authorized: false, reason: 'no command reference supplied' };
    }
    const path = `${await this.machinePath(machineId)}/vends/${encodeURIComponent(options.commandRef)}`;
    const { status, json } = await client.request('PUT', path, {
      body: { slot: options.manufacturerSlotId ?? slotCode },
      idempotencyKey: options.commandRef,
    });
    if (status >= 500) {
      // Ambiguous: the manufacturer may have started the vend before failing. Unknown, recoverable by lookup.
      throw new HardwareTimeoutError(ADAPTER_KEY, `vend returned HTTP ${status}`, 'transport.http_5xx');
    }
    const body = (json ?? {}) as { accepted?: unknown; reason?: unknown };
    if (status >= 400 || body.accepted === false) {
      return { vendRef: options.commandRef, authorized: false, reason: typeof body.reason === 'string' ? body.reason : `refused (HTTP ${status})` };
    }
    return { vendRef: options.commandRef, authorized: true, reason: null, delivery: 'synchronous' };
  }

  async getDispenseStatus(machineId: string, vendRef: string): Promise<DispenseStatusReport> {
    const client = this.requireClient('getDispenseStatus');
    const { status, json } = await client.request('GET', `${await this.machinePath(machineId)}/vends/${encodeURIComponent(vendRef)}`);
    if (status === 404) {
      // The manufacturer never received it — which, for a vend that timed out, is itself an answer.
      return { vendRef, state: 'failed', failureReason: 'manufacturer has no record of this vend' };
    }
    const body = (json ?? {}) as { state?: unknown; failureCode?: unknown; reason?: unknown };
    const reason = typeof body.reason === 'string' ? body.reason : null;
    switch (body.state) {
      case 'pending':
        return { vendRef, state: 'pending', failureReason: null };
      case 'dispensing':
        return { vendRef, state: 'dispensing', failureReason: null };
      case 'dispensed':
        return { vendRef, state: 'success', failureReason: null };
      case 'failed':
        return { vendRef, state: (typeof body.failureCode === 'string' && NATIVE_FAILURE_CODES[body.failureCode]) || 'failed', failureReason: reason };
      default:
        return { vendRef, state: 'unknown', failureReason: `unrecognised state ${JSON.stringify(body.state)}` };
    }
  }

  async getMachineStatus(machineId: string): Promise<VendingMachineStatusReport> {
    const body = await this.readMachine(machineId);
    return {
      machineId,
      online: body.online === true,
      doorOpen: typeof body.doorOpen === 'boolean' ? body.doorOpen : null,
      temperatureCelsius: typeof body.temperatureC === 'number' ? body.temperatureC : null,
      faults: Array.isArray(body.faults) ? body.faults.filter((fault): fault is string => typeof fault === 'string') : [],
      reportedAt: new Date().toISOString(),
    };
  }

  async getMachineInfo(machineId: string): Promise<MachineInfoReport> {
    const body = await this.readMachine(machineId);
    return {
      manufacturerMachineId: await this.resolveManufacturerMachineId(machineId),
      serialNumber: typeof body.serial === 'string' ? body.serial : null,
      model: typeof body.model === 'string' ? body.model : null,
      firmwareVersion: typeof body.firmware === 'string' ? body.firmware : null,
      controllerType: null,
      controllerVersion: null,
    };
  }

  async getTemperature(machineId: string): Promise<number | null> {
    return (await this.getMachineStatus(machineId)).temperatureCelsius;
  }

  async getFaults(machineId: string): Promise<string[]> {
    return (await this.getMachineStatus(machineId)).faults;
  }

  async getDoorStatus(machineId: string): Promise<'open' | 'closed' | null> {
    const doorOpen = (await this.getMachineStatus(machineId)).doorOpen;
    return doorOpen === null ? null : doorOpen ? 'open' : 'closed';
  }

  async getPaymentDeviceStatus(machineId: string): Promise<PaymentDeviceStatusReport> {
    const body = await this.readMachine(machineId);
    return typeof body.paymentDeviceOk === 'boolean' ? { present: true, ok: body.paymentDeviceOk, detail: null } : { present: false, ok: null, detail: null };
  }

  /** The reference contract has no slot/price endpoints — declared by leaving those capabilities out. */
  async getSlots(): Promise<VendingSlotReport[]> {
    throw new ProtocolNotConfiguredError(ADAPTER_KEY, 'getSlots');
  }

  async getInventory(): Promise<{ quantity: number | null }> {
    throw new ProtocolNotConfiguredError(ADAPTER_KEY, 'getInventory');
  }

  /** Prices live in Snack Quest (the customer pays through Snack Quest, not the machine), so there is nothing to push. */
  async setPrice(): Promise<void> {}

  async enableSlot(): Promise<void> {}

  async disableSlot(): Promise<void> {}

  receiveVendResult(): VendResultReport {
    throw new ProtocolNotConfiguredError(ADAPTER_KEY, 'receiveVendResult — outcomes arrive by webhook (vend.completed / vend.failed)');
  }

  receiveTelemetry(): VendingTelemetryReport {
    throw new ProtocolNotConfiguredError(ADAPTER_KEY, 'receiveTelemetry — telemetry arrives by webhook');
  }

  /** `{ id, events: [{ id, kind, machine, at?, slot?, detail? }] }` — the reference manufacturer's own webhook shape, translated. */
  parseWebhook(rawPayload: unknown): ParsedWebhook {
    const payload = asRecord(rawPayload);
    const deliveryId = requireString(payload, 'id');
    if (!Array.isArray(payload.events)) {
      throw new UnrecognisedHardwarePayloadError(ADAPTER_KEY, 'missing "events" array');
    }
    const events: AdapterMachineEvent[] = payload.events.map((raw) => {
      const event = asRecord(raw);
      const kind = requireString(event, 'kind');
      const detail = typeof event.detail === 'object' && event.detail !== null ? (event.detail as Record<string, unknown>) : {};
      const data: Record<string, unknown> = { ...detail };
      if (kind === 'vend.completed' || kind === 'vend.failed') {
        // The vend was created under our command reference, so that is its correlation handle.
        data.vendRef = typeof detail.requestId === 'string' ? detail.requestId : undefined;
        if (kind === 'vend.failed') {
          data.status = (typeof detail.failureCode === 'string' && NATIVE_FAILURE_CODES[detail.failureCode]) || 'failed';
          data.failureReason = typeof detail.reason === 'string' ? detail.reason : null;
        }
      }
      return {
        // Untranslated kinds pass through under their native name and are kept as UNKNOWN_EVENT.
        type: NATIVE_EVENT_TYPES[kind] ?? kind,
        manufacturerMachineId: requireString(event, 'machine'),
        eventId: requireString(event, 'id'),
        occurredAt: typeof event.at === 'string' ? event.at : null,
        manufacturerSlotId: typeof event.slot === 'string' ? event.slot : null,
        data,
      };
    });
    return { deliveryId, events };
  }

  private requireClient(action: string): ManufacturerHttpClient {
    if (!this.client) {
      throw new ProtocolNotConfiguredError(ADAPTER_KEY, action);
    }
    return this.client;
  }

  private async machinePath(machineId: string): Promise<string> {
    const manufacturerMachineId = await this.resolveManufacturerMachineId(machineId);
    if (!manufacturerMachineId) {
      throw new ProtocolNotConfiguredError(ADAPTER_KEY, `no manufacturer machine id configured for ${machineId}`);
    }
    return `/v1/machines/${encodeURIComponent(manufacturerMachineId)}`;
  }

  private async readMachine(machineId: string): Promise<Record<string, unknown>> {
    const { status, json } = await this.requireClient('getMachineStatus').request('GET', await this.machinePath(machineId));
    if (status >= 400) {
      throw new HardwareUnreachableError(ADAPTER_KEY, `machine status returned HTTP ${status}`);
    }
    return (json ?? {}) as Record<string, unknown>;
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
