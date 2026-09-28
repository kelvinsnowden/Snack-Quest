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
/**
 * Where the adapter gets Snack Quest's credential for a machine's
 * manufacturer — in production, `manufacturerApiCredentialService`
 * (per manufacturer × environment, encrypted, rotatable). Resolved per
 * call, so a rotation or revocation takes effect without a redeploy.
 */
export interface ReferenceHttpCredentialSource {
  credentialFor(machineId: string): Promise<{ baseUrl: string; apiKey: string; version: number } | null>;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  retryDelaysMs?: number[];
  resolveManufacturerMachineId?: (machineId: string) => Promise<string | null>;
}

export class ReferenceHttpAdapter implements VendingHardwareAdapter {
  readonly manufacturer = ADAPTER_KEY;
  private readonly staticClient: ManufacturerHttpClient | null;
  private readonly source: ReferenceHttpCredentialSource | null;
  private readonly clients = new Map<string, ManufacturerHttpClient>();
  private readonly resolveManufacturerMachineId: (machineId: string) => Promise<string | null>;

  /** A fixed `{ baseUrl, apiKey }` (tests, a single sandbox), or a credential source resolved per machine (production). */
  constructor(config: ReferenceHttpAdapterConfig | ReferenceHttpCredentialSource | null) {
    const fixed = config && 'baseUrl' in config ? config : null;
    this.source = config && 'credentialFor' in config ? config : null;
    this.staticClient = fixed?.baseUrl && fixed.apiKey
      ? new ManufacturerHttpClient({ adapterKey: ADAPTER_KEY, baseUrl: fixed.baseUrl, apiKey: fixed.apiKey, timeoutMs: fixed.timeoutMs, fetchImpl: fixed.fetchImpl, retryDelaysMs: fixed.retryDelaysMs })
      : null;
    this.resolveManufacturerMachineId =
      config?.resolveManufacturerMachineId ?? (async (machineId) => (await machineIntegrationRepository.findForAdapter(machineId))?.manufacturerMachineId ?? null);
  }

  capabilities(): HardwareCapabilities {
    if (!this.staticClient && !this.source) {
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
    let client: ManufacturerHttpClient;
    try {
      client = await this.clientFor(machineId, 'testConnection');
    } catch {
      return { ok: false, detail: 'No API credential is configured for this manufacturer in this environment (Integrations → manufacturer → API credentials).', latencyMs: null, errorKind: 'protocol' };
    }
    const startedAt = Date.now();
    try {
      const path = await this.machinePath(machineId);
      const { status } = await client.request('GET', path);
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
    const client = await this.clientFor(machineId, 'authorizeVend');
    if (!options.commandRef) {
      // Without our own reference the vend could not be made idempotent — refuse rather than risk a double dispense.
      return { vendRef: '', authorized: false, reason: 'no command reference supplied' };
    }
    const path = `${await this.machinePath(machineId)}/vends/${encodeURIComponent(options.commandRef)}`;
    const { status, json, malformed } = await client.request('PUT', path, {
      body: { slot: options.manufacturerSlotId ?? slotCode },
      idempotencyKey: options.commandRef,
    });
    // Every answer that doesn't prove "refused" or "accepted" is unknown —
    // the vend may exist — and is resolved by looking it up, never by
    // refunding or re-sending blindly.
    if (status >= 500) {
      throw new HardwareTimeoutError(ADAPTER_KEY, `vend returned HTTP ${status}`, 'transport.http_5xx');
    }
    if (status === 408 || status === 429) {
      throw new HardwareTimeoutError(ADAPTER_KEY, `vend still throttled (HTTP ${status}) after keyed retries`, 'transport.rate_limited');
    }
    if (status === 409) {
      throw new HardwareTimeoutError(ADAPTER_KEY, 'vend returned HTTP 409 for our idempotency key — a vend under it may exist', 'protocol.conflict');
    }
    if (status >= 300 && status < 400) {
      throw new HardwareTimeoutError(ADAPTER_KEY, `vend answered with a redirect (HTTP ${status}); redirects are not followed`, 'transport.redirect');
    }
    const body = (json ?? {}) as { accepted?: unknown; reason?: unknown };
    if (status >= 400) {
      // Rejected as a request (unknown machine, bad slot, validation): nothing was accepted.
      return { vendRef: options.commandRef, authorized: false, reason: typeof body.reason === 'string' ? body.reason : `refused (HTTP ${status})` };
    }
    if (malformed || typeof body.accepted !== 'boolean') {
      throw new HardwareTimeoutError(ADAPTER_KEY, `vend answered HTTP ${status} without a readable { accepted } body`, 'protocol.malformed_response');
    }
    if (!body.accepted) {
      return { vendRef: options.commandRef, authorized: false, reason: typeof body.reason === 'string' ? body.reason : 'refused by the manufacturer' };
    }
    return { vendRef: options.commandRef, authorized: true, reason: null, delivery: 'synchronous' };
  }

  async getDispenseStatus(machineId: string, vendRef: string): Promise<DispenseStatusReport> {
    const client = await this.clientFor(machineId, 'getDispenseStatus');
    const { status, json, malformed } = await client.request('GET', `${await this.machinePath(machineId)}/vends/${encodeURIComponent(vendRef)}`);
    if (status >= 500 || status === 408 || status === 429) {
      throw new HardwareTimeoutError(ADAPTER_KEY, `vend lookup returned HTTP ${status}`, status >= 500 ? 'transport.http_5xx' : 'transport.rate_limited');
    }
    if (status === 404) {
      // The manufacturer never received it — which, for a vend that timed out, is itself an answer.
      return { vendRef, state: 'failed', failureReason: 'manufacturer has no record of this vend' };
    }
    if (malformed || status >= 300) {
      return { vendRef, state: 'unknown', failureReason: `vend lookup answered HTTP ${status}${malformed ? ' with an unreadable body' : ''}` };
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

  private async clientFor(machineId: string, action: string): Promise<ManufacturerHttpClient> {
    if (this.staticClient) {
      return this.staticClient;
    }
    const credential = this.source ? await this.source.credentialFor(machineId) : null;
    if (!credential) {
      // Refused before anything is sent — provably undelivered.
      throw new ProtocolNotConfiguredError(ADAPTER_KEY, `${action}: no API credential configured for this manufacturer and environment`);
    }
    const cacheKey = `${credential.baseUrl}#${credential.version}`;
    let client = this.clients.get(cacheKey);
    if (!client) {
      client = new ManufacturerHttpClient({ adapterKey: ADAPTER_KEY, baseUrl: credential.baseUrl, apiKey: credential.apiKey, timeoutMs: this.source?.timeoutMs, fetchImpl: this.source?.fetchImpl, retryDelaysMs: this.source?.retryDelaysMs });
      if (this.clients.size > 100) this.clients.clear();
      this.clients.set(cacheKey, client);
    }
    return client;
  }

  private async machinePath(machineId: string): Promise<string> {
    const manufacturerMachineId = await this.resolveManufacturerMachineId(machineId);
    if (!manufacturerMachineId) {
      throw new ProtocolNotConfiguredError(ADAPTER_KEY, `no manufacturer machine id configured for ${machineId}`);
    }
    return `/v1/machines/${encodeURIComponent(manufacturerMachineId)}`;
  }

  private async readMachine(machineId: string): Promise<Record<string, unknown>> {
    const { status, json, malformed } = await (await this.clientFor(machineId, 'getMachineStatus')).request('GET', await this.machinePath(machineId));
    if (status >= 300) {
      throw new HardwareUnreachableError(ADAPTER_KEY, `machine status returned HTTP ${status}`);
    }
    if (malformed || typeof json !== 'object' || json === null) {
      throw new HardwareUnreachableError(ADAPTER_KEY, 'machine status body was not a JSON object', 'protocol.malformed_response');
    }
    return json as Record<string, unknown>;
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
