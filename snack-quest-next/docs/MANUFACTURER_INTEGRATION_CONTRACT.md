# Manufacturer integration contract

**Phase 4 note:** the commerce/inventory/operations work covered by
`docs/VENDING_OS_ARCHITECTURE.md` §10–11, `docs/MACHINE_COMMERCE.md`,
and `docs/VENDING_OPERATIONS_RUNBOOK.md` touched none of the
hardware-adapter or protocol layer this document governs — no new
manufacturer, no new capability, no change to `PROTOCOL_REGISTRY`.
This document stands exactly as it was written; named here rather
than left silently unmentioned in a phase-by-phase doc pass.

What a new manufacturer adapter — a real `ShengmaAdapter`
implementation once Shengma's protocol is known, or any other
manufacturer — must actually satisfy before it is trusted, and how
that gets verified rather than asserted. Read this alongside
`docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md` (the protocol-layer
history and the registry's own rules) and
`docs/VENDING_OS_ARCHITECTURE.md` §3–5 (the interface and capability
model this contract is written against).

## 1. Implement `VendingHardwareAdapter` directly

One interface (`lib/vending/hardwareAdapter.ts`), implemented
directly — not a manufacturer-specific type the business layer would
need to know about. `MockVendingAdapter` and `ShengmaAdapter` are both
proof of this: `MachineService`, `MachineCommandService`,
`MachineTransactionService`, and the admin diagnostics page all call
through the same interface regardless of which one a given machine
resolves to.

```ts
export interface VendingHardwareAdapter {
  readonly manufacturer: string;
  capabilities(): HardwareCapabilities;          // never throws
  getMachineStatus(machineId): Promise<VendingMachineStatusReport>;
  getSlots(machineId): Promise<VendingSlotReport[]>;
  getInventory(machineId, slotCode): Promise<{ quantity: number | null }>;
  setPrice(machineId, slotCode, priceKes): Promise<void>;
  enableSlot(machineId, slotCode): Promise<void>;
  disableSlot(machineId, slotCode): Promise<void>;
  authorizeVend(machineId, slotCode): Promise<VendAuthorizationResult>;
  receiveVendResult(rawPayload): VendResultReport;     // pure parser
  receiveTelemetry(rawPayload): VendingTelemetryReport; // pure parser
  getTemperature(machineId): Promise<number | null>;
  getFaults(machineId): Promise<string[]>;
}
```

**Every method must exist on the class.** A manufacturer that cannot
support one yet implements it as a throw
(`ProtocolNotConfiguredError`) or, for `authorizeVend` specifically, a
clean refusal — never a silent no-op, and never a fabricated success.
`ShengmaAdapter` is the reference example of "implements the whole
interface, does nothing real yet, says so honestly."

## 2. Register through `adapterRegistry.ts`, nowhere else

`lib/vending/adapterRegistry.ts`'s `defaultVendingAdapterResolver` is
the **only** place in this codebase that switches on
`Machine.manufacturer`. A new adapter is added there, as one more
branch — never by a Service importing a concrete adapter class
directly, which would reintroduce exactly the manufacturer-coupling
the interface exists to prevent.

## 3. Declare capabilities honestly — never optimistic, never guessed

`capabilities(): HardwareCapabilities` returns a `Partial<Record<HardwareCapability, boolean>>`.
Rules, enforced by convention and by `tests/lib/hardwareCapabilities.test.ts`'s
own discipline:

- **`true` only for a capability this adapter can actually exercise
  today**, against a real, documented protocol or API — never "this
  manufacturer's spec sheet mentions it" without a codec/parser behind
  it. `PROTOCOL_REGISTRY`'s `mdb` entry is the concrete precedent:
  framing is implemented and tested, but `supportedCapabilities: []`
  because no *peripheral command table* exists yet — a real capability
  isn't declared until the specific command is actually wired.
- **An unwired stub declares every capability `false` (`NO_CAPABILITIES`),
  never a partial guess.** This is what makes `classifyCapabilityStatus`
  (`docs/VENDING_OS_ARCHITECTURE.md` §4) able to tell "not configured"
  apart from "not supported" — a stub that declared `{vend: false}` and
  a stub that declared nothing would look identical to that classifier,
  but "declares false" must mean a real decision was made, so an
  adapter with nothing wired must declare literally everything `false`,
  matching `NO_CAPABILITIES` exactly.
- **Do not add a capability to the `HardwareCapability` union until
  something in this codebase actually reads it.** `ota`,
  `display_control`, `refrigeration_control` are named in the brief but
  intentionally absent from the type today — see
  `lib/vending/protocol/capabilities.ts`'s own comment. Adding them
  speculatively would be exactly the premature scaffolding this
  codebase avoids everywhere else.

## 4. Register the protocol in `PROTOCOL_REGISTRY`, and keep it honest

`lib/vending/protocol/registry.ts`'s `status` field has one rule:
`'implemented'` is asserted **only because the corresponding codec
file exists and has its own passing tests** —
`tests/lib/protocolRegistry.test.ts` checks this against the real code
(`mdbChecksum(...)`, `parseDexAudit(...)`), not against the registry's
own say-so. A new protocol slot starts at `'planned'` or
`'requires_documentation'`; it only becomes `'implemented'` once a real
codec exists and is tested, the same bar MDB/DEX cleared.

## 5. Never invent a command

If a peripheral command, an API endpoint, or a wire-level behaviour
is not in a manufacturer's actual published documentation or SDK, it
does not get written — not as a best guess, not as "probably how it
works," not even behind a capability flag. `lib/vending/protocol/mdb/frame.ts`
implements only the universal framing (checksum, addressing,
ACK/RET/NAK) that MDB 4.2's own spec fixes regardless of peripheral;
the peripheral-specific command table stays unbuilt until that
specific document is in hand. `ShengmaAdapter` is the same discipline
applied to an entire manufacturer: their control boards are *publicly*
documented as MDB/DEX-capable, but their own proprietary API is not
documented for this project, so nothing beyond the honest stub exists.

## 6. Dispense confirmation

`DispenseConfirmationStrategy` (`drop_sensor | motor_completion |
elevator_confirmation | weight_sensor | controller_confirmation`) is
recorded per-machine (`Machine.dispenseConfirmationStrategy`) as a
real, staff-known fact about that specific installation — never
inferred from the manufacturer name, because two machines from the
same manufacturer's line can ship with different sensors. An adapter
does not need to branch on this today (`receiveVendResult` already
normalizes whatever it parses into one `VendResultReport` regardless
of physical confirmation method); it exists so a future adapter that
*does* need to distinguish has somewhere real to read it from, rather
than adding the field under time pressure once that day comes.

## 7. Testing bar before "integrated" may be claimed

A manufacturer adapter earns `PROTOCOL_REGISTRY` status
`'implemented'` and a non-empty `supportedCapabilities` only once,
per capability:

1. The specific protocol/command is documented (a public spec, a
   manufacturer-provided SDK/API doc, or direct confirmation from the
   manufacturer) — not inferred from marketing copy.
2. A codec/parser/adapter method exists implementing exactly that
   documented behaviour, with unit tests against known-good frames or
   payloads (`lib/vending/protocol/mdb/frame.ts`,
   `lib/vending/protocol/dex/parser.ts` are the pattern).
3. **Real manufacturer compatibility is claimed only after that
   adapter has actually been exercised against real hardware** — a
   passing unit test against a hand-built frame proves the codec is
   correct against the spec, not that a real machine behaves the way
   the spec says it should. `MockVendingAdapter` proving the business
   layer's own logic (authorize → dispense → report) is a separate,
   already-cleared bar from proving any specific manufacturer's real
   hardware behaves as documented.

Until all three hold for a given manufacturer, the honest state is
exactly what `ShengmaAdapter` and `PROTOCOL_REGISTRY`'s
`requires_documentation`/`planned` entries already say: capable of
being integrated, not yet integrated.

## Still NEXT/SCALE

A real manufacturer adapter cleared against physical hardware (none
exists yet — `mock` remains the only fully-capable adapter);
peripheral-specific MDB command tables; generic HTTP/serial protocol
implementations (both `PROTOCOL_REGISTRY`-`planned`, blocked on a
manufacturer actually providing documentation); Snack Quest Controller
V1, which will be the first concrete consumer of this contract from
the controller side rather than the cloud-adapter side.
