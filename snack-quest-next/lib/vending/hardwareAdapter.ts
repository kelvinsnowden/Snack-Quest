/**
 * The hardware abstraction (§ HARDWARE ABSTRACTION, § "create a
 * vending hardware interface... do not assume Shengma's exact API
 * until we receive their documentation").
 *
 * Same shape as `lib/integrations/types.ts`'s `PaymentGateway`
 * interface, for the same reason: `MachineService` and friends depend
 * on `VendingHardwareAdapter`, never on a concrete `*VendingAdapter`
 * or a manufacturer SDK directly, so a real `ShengmaVendingAdapter` —
 * once Shengma's actual API is documented — drops in beside
 * `MockVendingAdapter` without touching a Service.
 *
 * The split mirrors `PaymentGateway.verifyCallback`: outbound calls
 * (`getMachineStatus`, `authorizeVend`, …) are `async` and talk to
 * real hardware or its cloud API; `receiveVendResult`/
 * `receiveTelemetry` are pure, synchronous **parsers** — a manufacturer's
 * webhook or gateway payload goes in, in whatever shape that
 * manufacturer defines, and Snack Quest's own canonical shape comes
 * out. Nothing above this interface ever reads a manufacturer's raw
 * payload directly; it reads what came back from one of these two.
 *
 * **What this interface deliberately does not promise:** that a
 * parsed "vend successful" is proof a customer paid
 * (§ financial correctness — that verification happens server-side,
 * before `authorizeVend` is ever called, never after), or that any
 * outbound method succeeds without a network round trip to hardware
 * that may be offline (§ offline behaviour). Every outbound method is
 * `async` for that reason, even the mock's, which resolves
 * synchronously today — a real adapter's won't, and nothing above
 * this interface should have to change when it doesn't.
 */

export interface VendingMachineStatusReport {
  machineId: string;
  online: boolean;
  doorOpen: boolean | null;
  temperatureCelsius: number | null;
  faults: string[];
  reportedAt: string;
}

export interface VendingSlotReport {
  slotCode: string;
  quantity: number | null;
  enabled: boolean;
}

export interface VendAuthorizationResult {
  /** The adapter/hardware's own reference for this authorized vend — what a later `receiveVendResult` correlates back to. */
  vendRef: string;
  authorized: boolean;
  /** Present only when `authorized` is false — the adapter's own reason (e.g. "slot empty", "door jammed"), never invented by the caller. */
  reason: string | null;
}

/** The canonical shape any manufacturer's vend-result payload normalises to. */
export interface VendResultReport {
  vendRef: string;
  dispensed: boolean;
  failureReason: string | null;
  deviceTimestamp: string | null;
  /** The manufacturer/gateway's own de-duplication key for this specific report, if it supplies one — carried through to `MachineTelemetryEvent.idempotencyKey`. Adapters that receive no such key from the device must derive a stable one (e.g. from `vendRef` + a result hash), never fabricate a fresh one per call, or a retried report would be treated as new every time. */
  idempotencyKey: string;
}

/** The canonical shape any manufacturer's telemetry payload normalises to. */
export interface VendingTelemetryReport {
  machineId: string;
  eventType: string;
  payload: Record<string, unknown>;
  deviceTimestamp: string | null;
  idempotencyKey: string;
}

export class UnrecognisedHardwarePayloadError extends Error {
  constructor(manufacturer: string, detail: string) {
    super(`${manufacturer} adapter could not parse this payload: ${detail}`);
    this.name = 'UnrecognisedHardwarePayloadError';
  }
}

export interface VendingHardwareAdapter {
  readonly manufacturer: string;

  getMachineStatus(machineId: string): Promise<VendingMachineStatusReport>;
  getSlots(machineId: string): Promise<VendingSlotReport[]>;
  getInventory(machineId: string, slotCode: string): Promise<{ quantity: number | null }>;
  setPrice(machineId: string, slotCode: string, priceKes: number): Promise<void>;
  enableSlot(machineId: string, slotCode: string): Promise<void>;
  disableSlot(machineId: string, slotCode: string): Promise<void>;
  /**
   * Requests the machine dispense from a slot. Called only after
   * payment is verified server-side — never in response to anything a
   * device itself asserted (§ financial correctness).
   */
  authorizeVend(machineId: string, slotCode: string): Promise<VendAuthorizationResult>;
  /**
   * Parses a manufacturer's raw vend-result payload into
   * `VendResultReport`. Pure and synchronous — no I/O, no trust
   * decision. Throws `UnrecognisedHardwarePayloadError` for a payload
   * this adapter cannot make sense of; the caller decides what to do
   * with that (typically: record it in `machineTelemetryEvents`
   * unprocessed, never apply it to a transaction).
   */
  receiveVendResult(rawPayload: unknown): VendResultReport;
  /** Same discipline as `receiveVendResult`, for heartbeat/fault/temperature/door/connectivity/stock reports. */
  receiveTelemetry(rawPayload: unknown): VendingTelemetryReport;
  getTemperature(machineId: string): Promise<number | null>;
  getFaults(machineId: string): Promise<string[]>;
}
