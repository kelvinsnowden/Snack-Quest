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

import type { IntegrationFailureCode } from './integrationErrors';
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
  /**
   * How an accepted vend reached the machine. `'synchronous'` (the
   * default when omitted): the hardware — or the manufacturer's own
   * cloud — confirmed receipt within this call. `'queued'`: nothing
   * has reached the machine yet; it collects the instruction on its
   * next poll of the Snack Quest Machine API (the inbound direction,
   * where the manufacturer builds against us). The dispense command
   * ledger records the two differently — acknowledged vs. merely sent.
   */
  delivery?: 'synchronous' | 'queued';
}

export interface VendAuthorizationOptions {
  /**
   * Snack Quest's own dispense-command reference. An adapter talking to
   * a manufacturer API sends it as that API's idempotency key, so a
   * retry is deduplicated on their side too — and uses it to ask for
   * the outcome later if the original request timed out.
   */
  commandRef?: string;
  /** The manufacturer's own name for the slot (`lib/vending/slotMapping.ts`), already translated. */
  manufacturerSlotId?: string;
}

/** The outcome of an explicit connectivity/credential check — the TEST step of CONFIGURE → TEST → ACTIVATE. Never throws for an ordinary failure; `ok: false` with a reason is the answer. */
export interface ConnectionTestResult {
  ok: boolean;
  /** What was checked and what happened — shown verbatim to the admin. */
  detail: string;
  latencyMs: number | null;
  /** Classifies a failure for integration-health counters. Null on success. */
  errorKind: 'connection' | 'authentication' | 'timeout' | 'protocol' | null;
}

/** Identity facts the machine/integration reports about itself — never trusted to overwrite Snack Quest's own identity (the SQ machine code), only recorded alongside it. */
export interface MachineInfoReport {
  manufacturerMachineId: string | null;
  serialNumber: string | null;
  model: string | null;
  firmwareVersion: string | null;
  controllerType: string | null;
  controllerVersion: string | null;
}

/** What the hardware says about one previously authorized vend — the pull-side counterpart to a pushed `receiveVendResult`. */
export interface DispenseStatusReport {
  vendRef: string;
  /** `'pending'`: the machine hasn't finished (or started). Any other value is a `DispenseResultStatus` outcome. */
  state: 'pending' | 'dispensing' | DispenseResultStatus;
  failureReason: string | null;
}

export interface PaymentDeviceStatusReport {
  present: boolean;
  ok: boolean | null;
  detail: string | null;
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

/**
 * The request provably never reached the machine (connection refused,
 * DNS failure, the manufacturer API rejected it before accepting it).
 * For a dispense this is the one failure that is safe to treat as
 * "nothing happened" — the customer is refunded, never re-dispensed.
 */
export class HardwareUnreachableError extends Error {
  constructor(adapterKey: string, detail: string, readonly code: IntegrationFailureCode = 'transport.network') {
    super(`${adapterKey}: machine unreachable — ${detail}`);
    this.name = 'HardwareUnreachableError';
  }
}

/**
 * The request may or may not have reached the machine — it was sent,
 * and no answer came back in time. For a dispense this must never be
 * retried automatically and never assumed failed: the product may
 * already be in the tray. The dispense command ledger records `unknown`
 * and the transaction goes to manual review.
 */
export class HardwareTimeoutError extends Error {
  constructor(adapterKey: string, detail: string, readonly code: IntegrationFailureCode = 'transport.timeout') {
    super(`${adapterKey}: no response in time — ${detail}`);
    this.name = 'HardwareTimeoutError';
  }
}

/** The manufacturer's API rejected Snack Quest's credentials. Classified separately so integration health can show an auth problem, not a generic outage. */
export class HardwareAuthenticationError extends Error {
  constructor(adapterKey: string, detail: string, readonly code: IntegrationFailureCode = 'auth.invalid_credentials') {
    super(`${adapterKey}: credentials rejected — ${detail}`);
    this.name = 'HardwareAuthenticationError';
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
  authorizeVend(machineId: string, slotCode: string, options?: VendAuthorizationOptions): Promise<VendAuthorizationResult>;
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

  /**
   * The TEST step of CONFIGURE → TEST → ACTIVATE. Must never throw for
   * an ordinary failure (unreachable, rejected credentials, no protocol
   * wired) — it returns `ok: false` with a reason, because "the test
   * failed" is itself the answer the admin asked for.
   */
  testConnection(machineId: string): Promise<ConnectionTestResult>;
  getMachineInfo(machineId: string): Promise<MachineInfoReport>;
  /** Pull the outcome of a vend this adapter authorized earlier — used by reconciliation when no pushed result arrived. */
  getDispenseStatus(machineId: string, vendRef: string): Promise<DispenseStatusReport>;
  getDoorStatus(machineId: string): Promise<'open' | 'closed' | null>;
  getPaymentDeviceStatus(machineId: string): Promise<PaymentDeviceStatusReport>;
  /**
   * Webhook-capable integrations only: parse one signed, already
   * verified manufacturer webhook body into Snack Quest's normalized
   * events. Pure and synchronous like the other two parsers; absent on
   * adapters whose manufacturer sends no webhooks.
   */
  parseWebhook?(rawPayload: unknown): ParsedWebhook;
}

/** A normalized event as an adapter translates it from a manufacturer payload — the input to `machineEventService.record`. */
export interface AdapterMachineEvent {
  /** Snack Quest's own event type (`types/machineEvent.ts`), already translated — never the manufacturer's native name. */
  type: string;
  /** The manufacturer's own machine identifier as it appears in their payload; Snack Quest resolves it to a machine through the integration record, never trusts it as an SQ id. */
  manufacturerMachineId: string;
  /** Unique per manufacturer + machine — the dedupe key for this one event. */
  eventId: string;
  occurredAt: string | null;
  /** The manufacturer's own slot identifier, when the event concerns one. */
  manufacturerSlotId: string | null;
  data: Record<string, unknown>;
}

export interface ParsedWebhook {
  /** The manufacturer's delivery id — the replay/idempotency key for the delivery as a whole. */
  deliveryId: string;
  events: AdapterMachineEvent[];
}
