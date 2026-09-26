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
 *
 * This is also the "universal machine contract"
 * (§ D of docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md): a manufacturer
 * adapter — `ShengmaAdapter` and any future one — implements this same
 * interface directly rather than a separate parallel type, since this
 * one already covers every action the business layer needs.
 */

import type { HardwareCapabilities } from './protocol/capabilities';

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

/**
 * The normalized outcome of one dispense attempt (§ DISPENSE RESULT).
 * `dispensed`/`failureReason` (below) stay as the two fields every
 * existing caller already reads — `status` is additive, the one new
 * fact this type didn't used to carry: *why* it wasn't a success, in
 * a vocabulary the business layer can actually branch on instead of
 * pattern-matching a free-text string. `unknown` is deliberately
 * distinct from every named failure: the device is not asserting a
 * specific fault, only that it cannot say what happened — the same
 * "genuinely don't know, don't guess" case a stuck-transaction timeout
 * already routes to `manual_review` for, now reachable from an
 * explicit device report too, not only from silence.
 */
export type DispenseResultStatus =
  | 'success'
  | 'failed'
  | 'timeout'
  | 'unknown'
  | 'jam'
  | 'no_product'
  | 'sensor_failure'
  | 'machine_offline';

/** The canonical shape any manufacturer's vend-result payload normalises to. */
export interface VendResultReport {
  vendRef: string;
  /** `status === 'success'` restated as a boolean — kept for every existing caller that only ever needed a yes/no. */
  dispensed: boolean;
  /** The normalized outcome (§ DISPENSE RESULT) — `'success'` iff `dispensed`. Every non-success value, including `'unknown'`, means inventory must never be decremented for this vend (§ MACHINE SALES: "failed vending must NOT automatically consume inventory"). */
  status: DispenseResultStatus;
  failureReason: string | null;
  deviceTimestamp: string | null;
  /** The manufacturer/gateway's own de-duplication key for this specific report, if it supplies one — carried through to `MachineTelemetryEvent.idempotencyKey`. Adapters that receive no such key from the device must derive a stable one (e.g. from `vendRef` + a result hash), never fabricate a fresh one per call, or a retried report would be treated as new every time. */
  idempotencyKey: string;
}

/**
 * Which physical method a machine's own hardware uses to confirm a
 * dispense actually happened (§ DISPENSE CONFIRMATION STRATEGIES) —
 * "machine configuration selects the appropriate strategy". Purely
 * descriptive today: `receiveVendResult` already normalizes whatever
 * an adapter parses into one `VendResultReport` regardless of which
 * physical method produced it, since no two manufacturers this
 * codebase has real documentation for report their confirmation
 * differently enough yet to need branching code. Recording which
 * strategy a given machine actually uses is still worth doing now —
 * it is a real, staff-known fact about the hardware, not invented —
 * so a future adapter that *does* need to special-case one has
 * somewhere to read it from instead of adding a new field under
 * time pressure.
 */
export type DispenseConfirmationStrategy =
  | 'drop_sensor'
  | 'motor_completion'
  | 'elevator_confirmation'
  | 'weight_sensor'
  | 'controller_confirmation';

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

/**
 * Thrown by a manufacturer adapter stub (e.g. `ShengmaAdapter`) for any
 * action beyond `capabilities()` — which must never throw, since
 * discoverability is unconditional — and `authorizeVend`, which has a
 * clean "refused" value already and returns that instead of throwing
 * (§ E of docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md). This is the
 * honest alternative to faking a response: it says "the interface slot
 * exists; no protocol is wired behind it yet."
 */
export class ProtocolNotConfiguredError extends Error {
  constructor(manufacturer: string, action: string) {
    super(
      `${manufacturer} adapter has no protocol configured for "${action}" — ` +
        `see the ProtocolAdapterRegistry (lib/vending/protocol/registry.ts) for what is implemented, planned, or blocked on manufacturer documentation.`,
    );
    this.name = 'ProtocolNotConfiguredError';
  }
}

export interface VendingHardwareAdapter {
  readonly manufacturer: string;

  /**
   * What this adapter can actually do — pure, synchronous, no I/O
   * (§ D of docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md). A capability
   * is a property of which protocol(s) this adapter was built against,
   * not something worth a network round trip to ask the machine.
   */
  capabilities(): HardwareCapabilities;

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
