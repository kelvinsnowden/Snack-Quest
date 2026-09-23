# Snack Quest hardware compatibility architecture (MDB / DEX / manufacturer adapters)

Written before any of this section's code was written, against the live
codebase, per the instruction: audit first, then A–J, then implement
Phase 1 only. Companion to `docs/VENDING_FOUNDATION.md` and
`docs/VENDING_OS_BENCHMARK.md` — this doc does not repeat what those
already cover (M-Pesa wiring, transaction state machine, admin fleet UI)
except where it changes.

**The reorientation this doc is about:** the earlier vending work assumed
we would eventually receive Shengma's proprietary API and write a
`ShengmaVendingAdapter` against it. Shengma has since told us they will
not hand over that documentation, but their control boards publicly
advertise support for **MDB 4.2** and **DEX/EVA-DTS** — both open,
published, manufacturer-independent specifications. So the target moves
from "wait for one manufacturer's private API" to "speak the industry's
standard interfaces first, and leave a clean, honest slot for whatever a
manufacturer additionally exposes."

---

## A. Current architecture summary

What exists today, read directly from the code, not assumed:

- **`VendingHardwareAdapter`** (`lib/vending/hardwareAdapter.ts`) is
  already the single hardware-facing interface. Every service
  (`machineService`, `machineTransactionService`, `machineTelemetryService`)
  depends on it, resolved through one function
  (`defaultVendingAdapterResolver`, `lib/vending/adapterRegistry.ts`) —
  never on a concrete adapter class. This is exactly the "business layer
  never knows whether the machine is Shengma, MIRACLE, WEIMI, TCN"
  principle this brief restates — it was already built, for the same
  reason, before this brief existed.
- **One implementation exists: `MockVendingAdapter`.** Stateful in
  memory, implements every method on the interface (status, slots,
  inventory, price, enable/disable, authorize vend, receive vend
  result, receive telemetry, temperature, faults).
- **The interface already separates outbound calls from inbound
  parsing.** `getMachineStatus`/`authorizeVend`/etc. are `async` calls
  *to* hardware; `receiveVendResult`/`receiveTelemetry` are pure,
  synchronous *parsers* of whatever a manufacturer's payload looks like,
  normalising into `VendResultReport`/`VendingTelemetryReport`. Nothing
  above the adapter ever reads a manufacturer's raw payload. This
  already satisfies "DEX-specific structures must not leak through the
  application" as a general pattern — DEX/MDB parsers below will
  produce the same normalised shapes, not new ones.
- **The resolver already refuses to guess.** `defaultVendingAdapterResolver`
  throws `UnsupportedManufacturerError` for `'shengma'`/`'other'` today,
  specifically because building a `ShengmaVendingAdapter` without a real
  API would mean inventing endpoints. That discipline is correct and is
  kept — what changes is *what* Shengma's slot resolves to (an honest
  stub with real, documented capability metadata) once we have
  something real to say about it, not a guess at their private API.
- **`Machine.manufacturer: 'mock' | 'shengma' | 'other'`**
  (`types/machine.ts`) already reserves a `'shengma'` value and already
  lets a machine be provisioned with it (`app/api/vending/register/route.ts`
  validates it as one of three accepted values). No code currently runs
  for it — provisioning succeeds, every subsequent adapter call throws.
- **No protocol layer exists.** There is no MDB, no DEX, no concept of
  "the adapter talks over a transport." The adapter today *is* the
  manufacturer implementation, flattened into one layer. That flattening
  was fine when the only adapter was a mock; it is the actual gap this
  brief is about.
- **No capability model exists.** Nothing declares what a given machine
  can and cannot do. The interface assumes every method is meaningful
  for every adapter, which is true for the mock (it implements
  everything) and would not be true for a real MDB-only machine (no
  direct remote price/enable/disable without a VMC that supports it) or
  a DEX-only integration (audit data, no live vend authorization at
  all).
- **Everything else audited in `VENDING_OS_BENCHMARK.md` is unchanged**:
  the M-Pesa payment wiring, the transaction state machine, device
  auth, telemetry idempotency, the admin fleet UI. None of it depends on
  what manufacturer a machine has — confirming, again, that the
  hardware-abstraction boundary was drawn in the right place already.

## B. Compatibility architecture

```
                    SNACK QUEST OS (unchanged)
                            │
                 VendingHardwareAdapter            ← existing interface, gains capabilities()
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
  MockVendingAdapter   ShengmaAdapter        (future adapters)
   (full capability)    (implements the        MiracleAdapter / WeimiAdapter /
                        same interface;         TcnAdapter — not built; same
                        capabilities() all      shape, blocked on a reason to
                        false until a           build them, not on architecture)
                        protocol is wired)
                            │
                 ┌──────────┴──────────┐
                 │                     │
            MdbTransport          DexTransport
           (interface only;      (interface only;
            MockMdbTransport      a real gateway feeds
            for tests; no        raw DEX text through
            serial I/O exists    this; no serial/USB
            in this repo)        I/O exists here)
                 │                     │
            MDB frame codec       DEX/EVA-DTS parser
           (checksum, ADD,       (DXS/DXE wrapper,
            ACK/RET/NAK —         ID1/PA1/PA2 records
            documented Level 1    → normalised events)
            structure only)
```

Two things this diagram is careful about, because getting them wrong is
exactly what the brief warns against:

1. **The protocol layer does not live inside the business layer.** MDB
   framing and DEX parsing are `lib/vending/protocol/**` — pure,
   synchronous, hardware-agnostic codecs with their own tests. A
   `VendingHardwareAdapter` implementation is free to use them, but
   `machineService`/`machineTransactionService`/`machineTelemetryService`
   never import them directly, the same discipline that already keeps
   those services off `MockVendingAdapter` specifically.
2. **A protocol codec is not a transport, and neither is a serial port
   driver.** `MdbTransport` is an interface (`connect`/`disconnect`/
   `write`/`onFrame`). Nothing in this repository opens a real serial
   port, a real TCP socket to a gateway, or a real USB/RS-485 line —
   this is a Next.js application on Vercel; it has no physical
   connection to a machine and never will directly. A **gateway**
   (§ H, §F below) is the thing that would hold a real `MdbTransport`
   implementation, running on hardware that is actually wired to a
   machine. Building a fake one here that "works" against nothing would
   be exactly the "claim hardware integration works without a real
   machine" this brief explicitly forbids.

## C. Current gaps

Using the same `EXISTING / KEEP / EXTEND / REFACTOR / MISSING / RISKY`
vocabulary as the benchmark doc:

| Capability | State | Detail |
|---|---|---|
| Hardware-agnostic business layer | **EXISTING / KEEP** | `VendingHardwareAdapter` + resolver already do this. |
| Manufacturer-guessing discipline | **EXISTING / KEEP** | Resolver already refuses to fabricate an API. |
| Capability discovery | **MISSING** | No `capabilities()`, no way for the UI or a service to ask "can this machine do X" without hard-coding manufacturer checks. |
| MDB protocol support | **MISSING** | Zero MDB code. Public, documented, testable without hardware at the framing level. |
| DEX/EVA-DTS support | **MISSING** | Zero DEX code. Public ASCII format, testable as a pure parser without hardware. |
| Manufacturer adapter for Shengma | **MISSING, now unblocked at the stub level** | Cannot be a real integration (no docs), but can honestly exist as an interface-conformant stub with real capability metadata — see §E. |
| Protocol/manufacturer registry | **MISSING** | Nothing currently declares, in one place, what's implemented vs. planned vs. blocked-on-docs per protocol/manufacturer. |
| Gateway (physical device software) | **MISSING, out of this repo's scope** | This is a Next.js web app; a gateway is separate deployable software for ARM/x86/Android hardware that would sit between a real machine and this API. Architecture for it is specified (§H); no code for it belongs in this repository, because there is nothing to run it against. |
| Hardware-in-the-loop mode | **MISSING, correctly blocked** | Requires a real MDB-wired machine or at minimum a real serial adapter on real hardware. Cannot be built or tested from here. |
| MQTT / realtime transport | **MISSING, correctly deferred** | `docs/VENDING_OS_BENCHMARK.md` §F already decided HTTPS-first for the same reason the original brief itself says not to force MQTT before it's needed. Unchanged by this doc. |
| Integration diagnostics UI | **MISSING** | No page shows a machine's live status/capabilities/faults on demand. Buildable now against the mock adapter and the (honest, refusing) Shengma stub — see §E, §H. |
| Capability-driven admin UI | **MISSING** | The existing machine detail page (`app/admin/(protected)/vending/[machineId]/page.tsx`) shows status/slots/transactions/telemetry, but nothing about what the machine's adapter can or cannot do. |

## D. Proposed protocol abstractions

- **`HardwareCapability`** — a closed string union naming each
  independently-checkable ability (`vend`, `slot_read`,
  `inventory_read`, `inventory_write`, `dispense_confirmation`,
  `heartbeat`, `telemetry`, `faults`, `temperature`, `door_status`,
  `remote_price_update`, `remote_enable_disable`, `audit_export`).
  Deliberately **not** including capabilities nothing in this codebase
  can act on yet (`ota`, `display_control`, `refrigeration_control`,
  `remote_restart`) — declaring a capability nothing consumes is the
  overbuilding this brief also warns against; those are documented as
  future additions in §H, added to the union only once something reads
  them.
- **`HardwareCapabilities`** — `Partial<Record<HardwareCapability, boolean>>`,
  read via a `hasCapability()` helper that treats an absent key as
  `false` rather than `undefined` — so a UI checking a capability never
  has to handle three states when only two are meaningful.
- **`VendingHardwareAdapter.capabilities()`** — synchronous, pure, no
  I/O, added to the existing interface. "Discoverable" means callable
  without a network round trip; a real adapter's capability set is a
  property of what protocol(s) it was built against, not something
  worth asking the physical machine at runtime in Phase 1.
- **`ProtocolNotConfiguredError`** — thrown by a manufacturer adapter
  stub for any action beyond `capabilities()` and `authorizeVend()` (the
  one action-shaped method whose return type already has a clean
  "refused" value — see §E). This is the honest alternative to a fake
  success: it says "the interface slot exists; nothing is wired behind
  it yet" rather than fabricating a plausible-looking response.
- **`MdbTransport`** — interface only (`connect`, `disconnect`,
  `write(frame)`, `onFrame(handler)`). No implementation beyond
  `MockMdbTransport`, used only by this repo's own protocol tests. A
  real implementation belongs in gateway software, not here.
- **MDB frame codec** (`lib/vending/protocol/mdb/frame.ts`) —
  pure functions for what MDB 4.2 documents unambiguously and
  independently of any specific peripheral: the checksum algorithm
  (sum of preceding bytes, mod 256), the 9-bit byte+mode encoding VMCs
  use to address peripherals, and the three universal control codes
  (ACK, RET, NAK). Deliberately **excludes** peripheral-specific command
  tables (cashless device commands, coin mech commands, specific status
  byte meanings) — those vary by peripheral class and require the
  actual MDB specification document in hand to encode correctly;
  inventing them from memory is exactly the "do not implement
  speculative commands" and "do not claim MDB gives capabilities it
  does not provide" this brief forbids. What's implemented is real and
  testable; what isn't is named as a TODO against the spec, not faked.
- **DEX/EVA-DTS parser** (`lib/vending/protocol/dex/parser.ts`) — a
  line-oriented parser for the published EVA-DTS record types most
  relevant to reconciliation: `DXS`/`DXE` (transmission wrapper and
  sequence), `ID1` (machine/software identification), `PA1` (per-slot
  price), `PA2` (per-slot vend count/value audit). Any record type
  outside this subset is preserved verbatim as an "unrecognised record"
  rather than dropped or guessed at, so nothing is silently lost and
  nothing is silently fabricated. This is intentionally a subset, not
  full EVA-DTS coverage — extending it to more record types (`CA17` cash
  audit, `EA1` error audit, etc.) is straightforward once a real DEX
  dump from a real machine is in hand to validate the parser against;
  doing that from memory now, untested against a real sample, would be
  the same speculative-implementation mistake as inventing MDB commands.
- **`ProtocolAdapterRegistry`** — a static, declarative list (not a
  runtime plugin system — nothing here needs to be hot-loaded) of every
  protocol/manufacturer slot this architecture knows about, each
  entry carrying `{ key, tier, status, supportedCapabilities,
  transportRequirement, notes }`. `status` is one of `'implemented'`
  (framing/parsing code exists and is tested), `'planned'` (Tier 2,
  architecturally slotted, not built), or `'requires_documentation'`
  (Tier 3 manufacturer adapters — cannot be built honestly without a
  spec or SDK). This is the single source of truth the admin
  diagnostics UI and this document both read from, so the two can never
  disagree about what's real.

## E. Proposed interfaces/types

```ts
// lib/vending/protocol/capabilities.ts
export type HardwareCapability =
  | 'vend' | 'slot_read' | 'inventory_read' | 'inventory_write'
  | 'dispense_confirmation' | 'heartbeat' | 'telemetry' | 'faults'
  | 'temperature' | 'door_status' | 'remote_price_update' | 'remote_enable_disable'
  | 'audit_export';

export type HardwareCapabilities = Partial<Record<HardwareCapability, boolean>>;
export function hasCapability(caps: HardwareCapabilities, cap: HardwareCapability): boolean;

// lib/vending/hardwareAdapter.ts — one addition to the existing interface
export interface VendingHardwareAdapter {
  readonly manufacturer: string;
  capabilities(): HardwareCapabilities;        // NEW — pure, synchronous
  // ...every existing method, unchanged
}

export class ProtocolNotConfiguredError extends Error {
  constructor(manufacturer: string, action: string);
}
```

`ShengmaAdapter` (and any future `MiracleAdapter`/`WeimiAdapter`/
`TcnAdapter`) implements `VendingHardwareAdapter` directly — **not** a
separate "ManufacturerAdapter" interface. The existing interface is
already the "universal machine contract" this brief asks for (§32 of the
brief maps almost one-to-one onto what `VendingHardwareAdapter` already
declares); adding a second, parallel interface for manufacturers would
duplicate it for no reason the codebase's own model doesn't already
serve. `capabilities()` returns every key `false`; `authorizeVend`
returns `{ authorized: false, reason: 'protocol not configured' }`
(a normal refusal, not an exception — the payment pipeline already
knows exactly what to do with a refused vend: move the transaction to
`paid_vend_failed` and let the refund path handle it, unchanged); every
other method throws `ProtocolNotConfiguredError`.

```ts
// lib/vending/protocol/mdb/frame.ts
export function mdbChecksum(bytes: number[]): number;
export function encodeAddressByte(deviceClass: number, command: number): number; // 5-bit class + 3-bit command
export const MDB_ACK = 0x00; export const MDB_RET = 0xAA; export const MDB_NAK = 0xFF;
export interface MdbFrame { data: number[]; checksum: number; }
export function buildFrame(data: number[]): MdbFrame;
export function verifyFrame(frame: MdbFrame): boolean;

// lib/vending/protocol/mdb/transport.ts
export interface MdbTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(frame: MdbFrame): Promise<void>;
  onFrame(handler: (frame: MdbFrame) => void): void;
}
export class MockMdbTransport implements MdbTransport { /* in-memory, test-only */ }

// lib/vending/protocol/dex/parser.ts
export interface DexAudit {
  machineIdentity: { id: string | null; softwareId: string | null } | null;
  slotPrices: { slot: string; priceCents: number }[];
  slotAudits: { slot: string; vendCount: number; vendValueCents: number }[];
  unrecognisedRecords: string[];
}
export function parseDexAudit(raw: string): DexAudit;

// lib/vending/protocol/registry.ts
export interface ProtocolRegistryEntry {
  key: string;              // 'mdb' | 'dex' | 'generic_http' | 'generic_serial' | 'shengma' | 'miracle' | 'weimi' | 'tcn' | 'mock'
  tier: 1 | 2 | 3;
  status: 'implemented' | 'planned' | 'requires_documentation';
  supportedCapabilities: HardwareCapability[];
  transportRequirement: string;
  notes: string;
}
export const PROTOCOL_REGISTRY: ProtocolRegistryEntry[];
```

## F. Required database changes

**None, for Phase 1.** This is a deliberate finding, not an oversight:
capabilities are a property of *code* (which adapter/protocol is
wired), not of stored data, for the same reason `MachineConnectivityStatus`
is derived at read time rather than stored (`lib/vending/connectivity.ts`)
— a derived fact cannot drift out of sync with what actually produced
it. `Machine.manufacturer` already exists and already selects the
adapter; no new field is needed for the resolver to also return
capability metadata alongside it.

A **future** need, explicitly not built now because nothing consumes it
yet (§H, NEXT): once a specific machine's *transport* can vary
independently of its manufacturer (e.g. two Shengma machines, one wired
for MDB and one for DEX-only audit pickup), a per-machine integration
profile (`protocol`, `dispenseConfirmationStrategy`) becomes a real
schema need — deferred exactly as `docs/VENDING_OS_BENCHMARK.md` deferred
the manufacturer onboarding flow, for the same reason: building the
config schema before there is a second real transport to configure would
be guessing at its shape.

## G. Required API changes

**None, for Phase 1.** No new device-facing route is needed:
`capabilities()` is synchronous code the admin UI calls server-side, not
a new endpoint. `/api/vending/telemetry` already accepts an arbitrary
raw payload per manufacturer/adapter (`adapter.receiveTelemetry`) — a
future gateway forwarding DEX text or MDB-derived events would go
through that same endpoint once wired to a real adapter that calls the
DEX parser internally, which is explicitly **not** wired in Phase 1 (§H)
because there is no real DEX producer yet to receive from. Wiring an
endpoint to a parser nothing calls would be the same
overbuilding mistake as inventing protocol commands, just one layer up.

## H. Implementation phases

**NOW (this change, Phase 1 of this doc):**
- `HardwareCapability`/`HardwareCapabilities` + `capabilities()` on the
  existing adapter interface.
- `MockVendingAdapter.capabilities()` — full capability set (it already
  implements every method).
- `ShengmaAdapter` — interface-conformant stub, wired into
  `defaultVendingAdapterResolver('shengma')`, replacing the current
  unconditional throw with an honest, capability-transparent object.
- MDB frame codec (checksum, addressing structure, ACK/RET/NAK) +
  `MdbTransport` interface + `MockMdbTransport`, tested at the framing
  level only.
- DEX/EVA-DTS parser for the `DXS`/`DXE`/`ID1`/`PA1`/`PA2` subset,
  tested against hand-built sample audit text.
- `ProtocolAdapterRegistry` — static metadata for mdb/dex/generic_http/
  generic_serial/shengma/miracle/weimi/tcn/mock.
- Admin: a read-only capability + protocol-registry panel on the
  existing machine detail page, plus a live status/slots/faults
  diagnostic read (via the resolved adapter, with
  `ProtocolNotConfiguredError`/`UnsupportedManufacturerError` rendered
  as "not yet integrated," never as a crash).

**NEXT (after a real gateway or a real DEX sample exists):**
- Wire a real `MdbTransport` implementation into gateway software (not
  this repository) once actual serial hardware is available to test
  against.
- Extend the DEX parser to more record types once a real machine's DEX
  dump is available to validate against.
- A per-machine integration profile (protocol, dispense-confirmation
  strategy) once a second real transport exists to need configuring.
- An interactive "run test" diagnostics button (test connection / read
  status / read slots / test vend) gated to `machine.status === 'testing'`
  — Phase 1 ships the read-only version of this; the interactive
  version needs a device-facing round trip design decision (which
  adapter method is safe to call from a staff click vs. only from a
  real payment) that deserves its own review rather than being rushed
  into this change.
- `MiracleAdapter`/`WeimiAdapter`/`TcnAdapter` stubs, if/when there is
  an actual reason to talk to one of those manufacturers — the registry
  already names them as `requires_documentation`; building empty stubs
  for manufacturers nobody is in contact with is speculative scaffolding,
  not architecture.

**SCALE (after a validated physical deployment):**
- Real MDB peripheral command tables, once the actual spec document (or
  a real cashless-device manufacturer's confirmed command set) is
  available to implement against.
- Hardware-in-the-loop mode against a real MDB-wired machine.
- MQTT/WebSocket cloud transport for the gateway, if HTTPS polling
  proves insufficient at fleet scale — unchanged from
  `docs/VENDING_OS_BENCHMARK.md`'s existing NEXT/SCALE call on this.
- OTA, remote restart, display/refrigeration control — added to
  `HardwareCapability` only once a real adapter can act on them.

## I. Risks

- **Overclaiming MDB/DEX coverage.** Mitigated by scoping both codecs to
  exactly what's implemented and tested, and naming everything else as
  an explicit gap in this document and in code comments, not silently
  omitting it.
- **A stubbed `ShengmaAdapter` being mistaken for a working integration.**
  Mitigated by `capabilities()` returning all-false and every action
  throwing/refusing with a message that names the reason
  (`"protocol not configured"`), surfaced verbatim in the admin
  diagnostics panel — there is no code path where a Shengma machine's
  adapter silently behaves as if it works.
- **Building gateway software or a real transport with nothing to run it
  against.** Mitigated by treating the gateway as explicitly out of this
  repository's scope (§H) rather than writing an untestable stand-in
  here.
- **Widening `HardwareCapability` speculatively.** Mitigated by only
  including capabilities the existing interface's methods actually
  correspond to; `ota`/`display_control`/`refrigeration_control` are
  named in this doc as future, not added to the type until something
  reads them.
- **Regressing the one existing adapter-resolution test.** Changing
  `defaultVendingAdapterResolver('shengma')` from "throws" to "returns a
  stub" is a deliberate, visible behaviour change — the existing test
  asserting the throw is updated in the same change, not left
  contradicting the new behaviour.

## J. Test strategy

- **Protocol tests** (pure, no I/O): MDB checksum correctness (including
  a deliberately corrupted frame failing `verifyFrame`), address-byte
  encoding, ACK/RET/NAK constants; DEX parser against a hand-built
  multi-record sample (`DXS`/`ID1`/`PA1`/`PA2`/`DXE` plus one
  deliberately unrecognised record type, asserting it lands in
  `unrecognisedRecords` rather than being dropped or throwing).
- **Adapter contract tests:** `ShengmaAdapter.capabilities()` is all
  `false`; `authorizeVend` returns an unauthorized refusal, never
  throws; every other method throws `ProtocolNotConfiguredError`;
  `MockVendingAdapter.capabilities()` is all `true` (it implements
  everything the interface offers).
- **Registry tests:** every `ProtocolRegistryEntry.key` is unique; every
  entry's `status` is one of the three defined values; the registry
  entries for `mdb`/`dex` say `'implemented'` only because the
  corresponding codec files actually exist and pass their own tests —
  checked by a test that imports both, not asserted independently of
  them.
- **Resolver regression test:** update the existing
  `defaultVendingAdapterResolver('shengma')` test to assert the new
  stub behaviour instead of the old throw; `'other'` keeps throwing
  `UnsupportedManufacturerError`, unchanged.
- **No hardware-in-the-loop tests** — there is no hardware to loop in.
  This is stated explicitly rather than silently absent from the test
  list.

---

## Phase 1 — implemented

**Files added:**
- `lib/vending/protocol/capabilities.ts` — `HardwareCapability`/`HardwareCapabilities`, `FULL_CAPABILITIES`, `NO_CAPABILITIES`, `hasCapability`.
- `lib/vending/protocol/mdb/frame.ts` — checksum, address-byte encode/decode, ACK/RET/NAK, `buildFrame`/`verifyFrame`.
- `lib/vending/protocol/mdb/transport.ts` — `MdbTransport` interface, `MockMdbTransport`.
- `lib/vending/protocol/dex/parser.ts` — `parseDexAudit` (DXS/DXE/ID1/PA1/PA2 subset).
- `lib/vending/protocol/registry.ts` — `PROTOCOL_REGISTRY`, `findProtocolRegistryEntry`.
- `lib/vending/adapters/shengmaAdapter.ts` — the honest Shengma stub.
- 5 new test files under `tests/lib/`: `hardwareCapabilities.test.ts`, `shengmaAdapter.test.ts`, `mdbProtocol.test.ts`, `dexParser.test.ts`, `protocolRegistry.test.ts` (58 new tests).

**Files edited:**
- `lib/vending/hardwareAdapter.ts` — added `capabilities(): HardwareCapabilities` to `VendingHardwareAdapter`; added `ProtocolNotConfiguredError`.
- `lib/vending/adapters/mockVendingAdapter.ts` — implements `capabilities()` (`FULL_CAPABILITIES`).
- `lib/vending/adapterRegistry.ts` — `'shengma'` now resolves to `ShengmaAdapter` instead of throwing; `'other'` unchanged.
- `tests/lib/mockVendingAdapter.test.ts` — updated the resolver test for the new `'shengma'` behaviour.
- `app/admin/(protected)/vending/[machineId]/page.tsx` — added the capabilities + integration diagnostics panel, reading live through the resolved adapter.
- `docs/VENDING_FOUNDATION.md`, `docs/VENDING_OS_BENCHMARK.md` — corrected to no longer describe `'shengma'` as throwing `UnsupportedManufacturerError`.

**No database or Firestore rules changes** — confirmed per §F: capabilities are computed from code, not stored.

**Measured results:**
- `tsc --noEmit` — clean.
- `npm run lint` — 2 warnings, the same 2 this repo already carried before this change (`services/deliveryService.ts`, `tests/integrations/smtpEmailGateway.test.ts`); 0 new.
- `npm run build` — exits 0; the machine detail page's new diagnostics panel compiles and renders as a Server Component with no new client bundle surface.
- `npm test` (the real command — `firebase emulators:exec ... vitest run`) — **245 test files, 2,694 tests, all passing.**
- One false alarm worth recording: running `vitest run` directly (bypassing `firebase emulators:exec`) makes every Firestore-backed test's `beforeEach(cleanCollections)` hang until a 10s hook timeout, because no emulator is listening — reproduced identically against the pre-Phase-1 code via `git stash`, confirming it as a pre-existing property of this environment's test setup, not a regression from anything in this phase. Recorded here so it isn't mistaken for one again.

---

## Phase 2 — implemented (remote commands + the CloudTransport abstraction)

The two items named first in this doc's own §H "NEXT" list — the
remote command center and a real-time cloud transport — built once
there was a concrete reason to (the user asked to start NEXT-bucket
work specifically on these two). Audited against Phase 1's own code
first, same discipline as before: `VendingHardwareAdapter`'s
synchronous methods (`setPrice`/`enableSlot`/`disableSlot`) only work
today because the one adapter that exists is an in-process mock with
nothing remote to be unreachable — a real command queue is what a
manufacturer whose gateway only ever calls in (the actual shape MDB/DEX
deployments take) structurally requires, so it was built as its own
model rather than extending those methods' illusion of synchronous
reach.

**`MachineCommand`** (`types/machineCommand.ts`) — one command type so
far, `restart`, chosen because it's the one action in the original
brief's command sketch (`restart`/`lock`/`unlock`/
`updateConfiguration`/`updateFirmware`/`cancelVend`) with no existing
adapter concept, no OTA dependency, and a real caller (the admin UI,
the simulator) ready to exercise it — everything else in that sketch
stays out for the same "speculative surface with no caller" reason
`docs/VENDING_OS_BENCHMARK.md` already gave for not extending the
adapter interface itself. Status machine: `pending → acknowledged →
completed|failed`, `pending|acknowledged → expired`, mirroring
`MACHINE_TRANSACTION_STATUS_TRANSITIONS` exactly.

**Delivery is polling, not a direct adapter call.** `POST
/api/vending/machines/[id]/commands` (staff-issued, capability-gated
against the machine's own resolved adapter) only ever writes a
`pending` document — it never touches `VendingHardwareAdapter`. `GET
/api/vending/commands` (device-authenticated) is what a real gateway
would poll on a schedule; `POST .../ack` and `POST .../complete` are
the device's own report of receipt and outcome. A
`reconcile-vending-commands` cron (daily, mirroring
`reconcile-vending-transactions`) expires anything stuck past its
threshold, same pattern, same reasoning, third collection.

**`CloudTransport`** (`lib/vending/protocol/cloudTransport.ts`) — the
real-time nudge this doc's §H already named ("MQTT can become the
real-time transport later"). `MachineCommandService.issueCommand`
calls `transport.notifyMachine()` after every write, but the default
(`NullCloudTransport`) is a no-op: polling alone already delivers
every command correctly, so a missing or failing transport changes
nothing about correctness, only latency. No real MQTT (or WebSocket)
implementation exists — building one now would mean picking a specific
broker/service and guessing at its API before that choice is made,
the same "TODO: adapter interface, not fake integration" discipline
already applied to MDB's peripheral commands and to `ShengmaAdapter`.
`PROTOCOL_REGISTRY` gained an `mqtt` entry, `status: 'planned'`,
explicit about exactly this: the abstraction is real and used; the
broker integration is not.

**Capability model:** `remote_restart` graduated from
`capabilities.ts`'s own "deferred until something reads it" list —
`issueCommand` is that reader. `MockVendingAdapter` (full capability)
can be issued a restart; `ShengmaAdapter` (all capabilities false)
cannot, and `issueCommand` refuses it before ever writing a command,
rather than writing one a machine could never acknowledge.

**Admin UI:** the machine detail page's "Remote commands" card shows
an "Issue restart command" action only when the resolved adapter
declares `remote_restart`, plus the full command history with status
badges — reusing the same capability-gating pattern the diagnostics
panel already established in Phase 1.

**Simulator:** `SimulatedMachine.pollAndExecuteCommands()` — poll,
acknowledge, then report an outcome, the same three-step discipline
the purchase flow already holds for payment/vend. Proven against the
real routes: a successful restart, a reported failure (never silently
turned into a success), and an offline machine that never touches a
command it was told about.

**Measured:** `tsc --noEmit` clean. `npm run lint` at the same 2
pre-existing warnings (0 new — two `react/no-unescaped-entities`
errors were caught and fixed in the admin UI text before this count).
`npm run build` exits 0. Full suite via `npm test`: **250 test files,
2,734 tests, all green** (40 new, zero regressions from Phase 1's 245
files / 2,694 tests).

**Deliberately not built, and why:**
- A real `MqttCloudTransport` — no broker chosen yet; see
  `CloudTransport`'s own doc comment.
- Any command type beyond `restart` — no adapter concept or caller
  exists yet for the others in the original sketch.
- A per-machine integration profile / manufacturer onboarding flow —
  still blocked on the same "no second real transport to configure"
  reason `docs/VENDING_OS_BENCHMARK.md` already gave.
- MIRACLE/WEIMI/TCN adapters — still no manufacturer to build one for.
