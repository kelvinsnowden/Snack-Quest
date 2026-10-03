import { randomUUID } from 'node:crypto';
import {
  HardwareTimeoutError,
  HardwareUnreachableError,
  UnrecognisedHardwarePayloadError,
  type AdapterMachineEvent,
  type ConnectionTestResult,
  type DispenseResultStatus,
  type DispenseStatusReport,
  type MachineInfoReport,
  type ParsedWebhook,
  type PaymentDeviceStatusReport,
  type VendAuthorizationResult,
  type VendResultReport,
  type VendingHardwareAdapter,
  type VendingMachineStatusReport,
  type VendingSlotReport,
  type VendingTelemetryReport,
} from '../hardwareAdapter';

/** How the simulated hardware responds to the next `authorizeVend` — the failure modes a real integration has to survive. */
export type MockAuthorizeBehaviour = 'normal' | 'timeout' | 'unreachable';

const DISPENSE_RESULT_STATUSES: DispenseResultStatus[] = [
  'success',
  'failed',
  'timeout',
  'unknown',
  'jam',
  'no_product',
  'sensor_failure',
  'machine_offline',
];
import { FULL_CAPABILITIES, type HardwareCapabilities } from '../protocol/capabilities';

/**
 * `MockVendingAdapter` — the only `VendingHardwareAdapter`
 * implementation until a real manufacturer's API is documented
 * (§ HARDWARE ABSTRACTION: "create a placeholder/mock adapter for
 * testing"). Every machine in this codebase runs through this today;
 * `Machine.manufacturer: 'mock'` is what selects it.
 *
 * Deliberately stateful in memory rather than a pure stub: the
 * point of having a mock at all is to prove `MachineService`'s own
 * logic (authorize → dispense → report) against something that
 * behaves like real hardware — a slot that is disabled really does
 * refuse to authorize, an empty slot really does report zero
 * quantity — rather than a mock that always says yes and proves
 * nothing about the calling code's error handling.
 *
 * State is per-instance and never persisted; tests construct a fresh
 * one per case, the same isolation discipline every other test in
 * this codebase gets from `beforeEach` clearing collections.
 */
export class MockVendingAdapter implements VendingHardwareAdapter {
  readonly manufacturer = 'mock';

  private readonly slots = new Map<string, Map<string, { quantity: number; enabled: boolean; priceKes: number }>>();
  private readonly faults = new Map<string, string[]>();
  private readonly online = new Set<string>();
  private readonly doorOpen = new Set<string>();
  private readonly authorizeBehaviour = new Map<string, MockAuthorizeBehaviour>();
  private readonly vends = new Map<string, { machineId: string; slotCode: string; state: DispenseStatusReport['state']; failureReason: string | null }>();
  /** How many times the hardware was actually told to dispense — lets a test prove a retry never reached the machine twice. */
  dispenseInstructionCount = 0;

  /** Implements every method on the interface — the reference full-capability adapter. */
  capabilities(): HardwareCapabilities {
    return FULL_CAPABILITIES;
  }

  /** Test/seed helper — not part of the interface. Real hardware's slots are configured through `setPrice`/`enableSlot`/a restock, not seeded directly. */
  seedSlot(machineId: string, slotCode: string, config: { quantity: number; enabled?: boolean; priceKes?: number }): void {
    const machineSlots = this.slots.get(machineId) ?? new Map();
    machineSlots.set(slotCode, {
      quantity: config.quantity,
      enabled: config.enabled ?? true,
      priceKes: config.priceKes ?? 0,
    });
    this.slots.set(machineId, machineSlots);
    this.online.add(machineId);
  }

  /** Test helper — simulates a fault report the next `getFaults`/`getMachineStatus` call will surface. */
  seedFault(machineId: string, fault: string): void {
    const existing = this.faults.get(machineId) ?? [];
    this.faults.set(machineId, [...existing, fault]);
  }

  /** Test helper — simulates the machine going offline (e.g. connectivity lost). */
  setOffline(machineId: string): void {
    this.online.delete(machineId);
  }

  /** Test helper — brings a machine back online without re-seeding its slots. */
  setOnline(machineId: string): void {
    this.online.add(machineId);
  }

  setDoorOpen(machineId: string, open: boolean): void {
    if (open) {
      this.doorOpen.add(machineId);
    } else {
      this.doorOpen.delete(machineId);
    }
  }

  /** Test helper — makes subsequent `authorizeVend` calls for this machine time out or fail to connect. */
  setAuthorizeBehaviour(machineId: string, behaviour: MockAuthorizeBehaviour): void {
    this.authorizeBehaviour.set(machineId, behaviour);
  }

  /** Test helper — the machine finishing (or failing) a vend it accepted, surfaced through `getDispenseStatus`. */
  completeVend(vendRef: string, state: DispenseStatusReport['state'], failureReason: string | null = null): void {
    const vend = this.vends.get(vendRef);
    if (!vend) {
      throw new Error(`mock adapter: no vend ${vendRef}`);
    }
    vend.state = state;
    vend.failureReason = failureReason;
  }

  async getMachineStatus(machineId: string): Promise<VendingMachineStatusReport> {
    return {
      machineId,
      online: this.online.has(machineId),
      doorOpen: this.doorOpen.has(machineId),
      temperatureCelsius: 22,
      faults: this.faults.get(machineId) ?? [],
      reportedAt: new Date().toISOString(),
    };
  }

  async getSlots(machineId: string): Promise<VendingSlotReport[]> {
    const machineSlots = this.slots.get(machineId) ?? new Map();
    return Array.from(machineSlots.entries()).map(([slotCode, slot]) => ({
      slotCode,
      quantity: slot.quantity,
      enabled: slot.enabled,
    }));
  }

  async getInventory(machineId: string, slotCode: string): Promise<{ quantity: number | null }> {
    const slot = this.slots.get(machineId)?.get(slotCode);
    return { quantity: slot?.quantity ?? null };
  }

  async setPrice(machineId: string, slotCode: string, priceKes: number): Promise<void> {
    const slot = this.requireSlot(machineId, slotCode);
    slot.priceKes = priceKes;
  }

  async enableSlot(machineId: string, slotCode: string): Promise<void> {
    this.requireSlot(machineId, slotCode).enabled = true;
  }

  async disableSlot(machineId: string, slotCode: string): Promise<void> {
    this.requireSlot(machineId, slotCode).enabled = false;
  }

  async authorizeVend(machineId: string, slotCode: string): Promise<VendAuthorizationResult> {
    const vendRef = `mock-vend-${randomUUID()}`;
    const slot = this.slots.get(machineId)?.get(slotCode);

    const behaviour = this.authorizeBehaviour.get(machineId) ?? 'normal';
    if (behaviour === 'unreachable') {
      throw new HardwareUnreachableError('mock', 'connection refused');
    }
    if (behaviour === 'timeout') {
      // A real timeout: the instruction went out and the answer never
      // came back — the hopper may well have turned. Simulate exactly
      // that ambiguity by counting it as a delivered instruction.
      this.dispenseInstructionCount += 1;
      throw new HardwareTimeoutError('mock', 'no acknowledgement within 10s');
    }

    if (!this.online.has(machineId)) {
      return { vendRef, authorized: false, reason: 'machine offline' };
    }
    if (!slot) {
      return { vendRef, authorized: false, reason: 'slot not found' };
    }
    if (!slot.enabled) {
      return { vendRef, authorized: false, reason: 'slot disabled' };
    }
    if (slot.quantity <= 0) {
      return { vendRef, authorized: false, reason: 'slot empty' };
    }

    // Authorizing decrements the mock's own count immediately, the
    // way a real machine's hopper does the instant it starts a vend
    // cycle — the *inventory ledger* movement is still the caller's
    // job (`machineInventoryMovementService`), not this adapter's.
    slot.quantity -= 1;
    this.dispenseInstructionCount += 1;
    this.vends.set(vendRef, { machineId, slotCode, state: 'pending', failureReason: null });
    return { vendRef, authorized: true, reason: null, delivery: 'synchronous' };
  }

  async testConnection(machineId: string): Promise<ConnectionTestResult> {
    return this.online.has(machineId)
      ? { ok: true, detail: 'mock machine responded', latencyMs: 0, errorKind: null }
      : { ok: false, detail: 'mock machine is offline', latencyMs: null, errorKind: 'connection' };
  }

  async getMachineInfo(machineId: string): Promise<MachineInfoReport> {
    return {
      manufacturerMachineId: `mock-${machineId}`,
      serialNumber: null,
      model: 'Mock Vendor',
      firmwareVersion: 'mock-1.0',
      controllerType: 'mock',
      controllerVersion: '1.0',
    };
  }

  async getDispenseStatus(machineId: string, vendRef: string): Promise<DispenseStatusReport> {
    const vend = this.vends.get(vendRef);
    if (!vend || vend.machineId !== machineId) {
      return { vendRef, state: 'unknown', failureReason: 'machine has no record of this vend' };
    }
    return { vendRef, state: vend.state, failureReason: vend.failureReason };
  }

  async getDoorStatus(machineId: string): Promise<'open' | 'closed' | null> {
    if (!this.online.has(machineId)) {
      return null;
    }
    return this.doorOpen.has(machineId) ? 'open' : 'closed';
  }

  async getPaymentDeviceStatus(): Promise<PaymentDeviceStatusReport> {
    return { present: true, ok: true, detail: 'mock card reader' };
  }

  /**
   * The mock's own webhook format — a stand-in for "some manufacturer's
   * webhook", used by the webhook-ingestion tests and the simulator:
   * `{ deliveryId, events: [{ type, machineId, eventId, occurredAt?, slotId?, data? }] }`.
   * `type` is already a Snack Quest event name here; a real adapter's
   * job is the translation from the manufacturer's own vocabulary.
   */
  parseWebhook(rawPayload: unknown): ParsedWebhook {
    const payload = asRecord(rawPayload, 'mock');
    const deliveryId = requireString(payload, 'deliveryId', 'mock');
    if (!Array.isArray(payload.events)) {
      throw new UnrecognisedHardwarePayloadError('mock', 'missing "events" array');
    }
    const events: AdapterMachineEvent[] = payload.events.map((raw) => {
      const event = asRecord(raw, 'mock');
      return {
        type: requireString(event, 'type', 'mock'),
        manufacturerMachineId: requireString(event, 'machineId', 'mock'),
        eventId: requireString(event, 'eventId', 'mock'),
        occurredAt: typeof event.occurredAt === 'string' ? event.occurredAt : null,
        manufacturerSlotId: typeof event.slotId === 'string' ? event.slotId : null,
        data: typeof event.data === 'object' && event.data !== null ? (event.data as Record<string, unknown>) : {},
      };
    });
    return { deliveryId, events };
  }

  receiveVendResult(rawPayload: unknown): VendResultReport {
    const payload = asRecord(rawPayload, 'mock');
    const vendRef = requireString(payload, 'vendRef', 'mock');
    const dispensed = requireBoolean(payload, 'dispensed', 'mock');
    // `status` is additive (§ DISPENSE RESULT) — a caller that only
    // ever supplied `dispensed` (every payload written before this
    // field existed) still gets a coherent status, derived rather
    // than required, so nothing already sending the old shape breaks.
    let status: DispenseResultStatus;
    if (typeof payload.status === 'string' && DISPENSE_RESULT_STATUSES.includes(payload.status as DispenseResultStatus)) {
      status = payload.status as DispenseResultStatus;
      if (dispensed !== (status === 'success')) {
        throw new UnrecognisedHardwarePayloadError('mock', `dispensed (${dispensed}) disagrees with status "${status}"`);
      }
    } else {
      status = dispensed ? 'success' : 'failed';
    }
    return {
      vendRef,
      dispensed,
      status,
      failureReason: typeof payload.failureReason === 'string' ? payload.failureReason : null,
      deviceTimestamp: typeof payload.deviceTimestamp === 'string' ? payload.deviceTimestamp : null,
      idempotencyKey:
        typeof payload.idempotencyKey === 'string' && payload.idempotencyKey
          ? payload.idempotencyKey
          : `mock-vend-result:${vendRef}`,
    };
  }

  receiveTelemetry(rawPayload: unknown): VendingTelemetryReport {
    const payload = asRecord(rawPayload, 'mock');
    const machineId = requireString(payload, 'machineId', 'mock');
    const eventType = requireString(payload, 'eventType', 'mock');
    const idempotencyKey = requireString(payload, 'idempotencyKey', 'mock');
    return {
      machineId,
      eventType,
      payload: (payload.payload as Record<string, unknown>) ?? {},
      deviceTimestamp: typeof payload.deviceTimestamp === 'string' ? payload.deviceTimestamp : null,
      idempotencyKey,
    };
  }

  async getTemperature(machineId: string): Promise<number | null> {
    return this.online.has(machineId) ? 22 : null;
  }

  async getFaults(machineId: string): Promise<string[]> {
    return this.faults.get(machineId) ?? [];
  }

  private requireSlot(machineId: string, slotCode: string) {
    const slot = this.slots.get(machineId)?.get(slotCode);
    if (!slot) {
      throw new Error(`mock adapter: no slot ${slotCode} seeded for machine ${machineId}`);
    }
    return slot;
  }
}

function asRecord(value: unknown, manufacturer: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new UnrecognisedHardwarePayloadError(manufacturer, 'payload is not an object');
  }
  return value as Record<string, unknown>;
}

function requireString(payload: Record<string, unknown>, key: string, manufacturer: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || !value) {
    throw new UnrecognisedHardwarePayloadError(manufacturer, `missing or non-string "${key}"`);
  }
  return value;
}

function requireBoolean(payload: Record<string, unknown>, key: string, manufacturer: string): boolean {
  const value = payload[key];
  if (typeof value !== 'boolean') {
    throw new UnrecognisedHardwarePayloadError(manufacturer, `missing or non-boolean "${key}"`);
  }
  return value;
}
