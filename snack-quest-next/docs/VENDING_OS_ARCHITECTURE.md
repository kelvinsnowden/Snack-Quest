# Snack Quest Vending OS — architecture

One manufacturer-independent business layer, unaware of any specific
vending machine's electronics, sitting above a hardware abstraction
that *is* aware of them (§ HARDWARE ABSTRACTION: "create a vending
hardware interface... never write manufacturer-specific vending
commands directly into business logic"). This document is the
top-level map; `docs/MACHINE_RUNTIME.md`, `docs/MACHINE_CATALOG_RUNTIME.md`,
and `docs/MANUFACTURER_INTEGRATION_CONTRACT.md` go deeper on the
gateway/runtime, the customer screen, and what a new manufacturer
adapter must implement, respectively. `docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md`
remains the record of the protocol-layer work (MDB/DEX framing,
capability model's origin) this document builds on rather than
repeats.

## 1. The layer stack

```
Cloud (this repository)
├── Business layer      — Services: machineTransactionService,
│                          machineAssortmentService, machineService,
│                          machineCommandService, ... Never reads a
│                          manufacturer name to decide behaviour.
├── Vending domain       — Machine, MachineSlot, MachineTransaction,
│                          MachineAssortment, MachineCommand, ...
│                          Firestore types/repositories. Manufacturer-
│                          agnostic data shapes.
├── Hardware abstraction — VendingHardwareAdapter interface
│                          (lib/vending/hardwareAdapter.ts). The one
│                          boundary every manufacturer crosses the
│                          same way.
├── Protocol/transport   — MDB frame codec, DEX/EVA-DTS parser,
│                          CloudTransport (lib/vending/protocol/**).
│                          Real wire formats, not business logic.
├── Manufacturer adapter — MockVendingAdapter (full), ShengmaAdapter
│                          (honest stub — see § 5).
├── Controller           — NOT built this phase (see § 6). A future
│                          physical box that runs an adapter against
│                          real MDB/DEX wiring.
└── Physical machine     — real hardware, not simulated anywhere in
                            this repository except MockVendingAdapter's
                            in-memory state.
```

Every arrow points one way: the business layer depends on the
hardware-abstraction *interface*, never on a concrete adapter class or
a manufacturer name, via `VendingAdapterResolver`
(`lib/vending/adapterRegistry.ts`) — the single place in this codebase
that switches on `Machine.manufacturer`. `MachineCommandService`,
`MachineService.testVend`, and every other service that needs to talk
to hardware take an injectable resolver defaulting to
`defaultVendingAdapterResolver`, the same dependency-injection pattern
already proven for `PaymentGateway`.

## 2. The customer screen must be thin

A machine's customer-facing screen calls exactly one route for its own
catalog — `GET /api/vending/machines/{machineId}/catalog` — and
renders exactly what comes back. It never fetches the global product
catalogue, never decides sellability, price, or promotional state
itself. See `docs/MACHINE_CATALOG_RUNTIME.md` for the full contract;
the point at this level is architectural: **every pricing/eligibility
decision already happened server-side** by the time a byte reaches the
screen, so a compromised or buggy screen cannot show — let alone sell
— something the business layer didn't authorize.

## 3. Hardware abstraction — required vs. optional

`VendingHardwareAdapter` (`lib/vending/hardwareAdapter.ts`) is the
"universal machine contract" every adapter implements directly, not a
parallel type per manufacturer:

**Required on every adapter** (throws or returns a real refusal —
never silently no-ops):
`capabilities()`, `getMachineStatus`, `getSlots`, `getInventory`,
`authorizeVend`, `receiveVendResult`, `receiveTelemetry`, `getFaults`,
`getTemperature`. `authorizeVend`/`receiveVendResult`/`receiveTelemetry`
together are the vend/dispense-confirmation/heartbeat surface named in
the brief as VEND/DISPENSE_CONFIRMATION/HEARTBEAT/TELEMETRY.

**Optional, capability-gated** — `setPrice`/`enableSlot`/`disableSlot`
exist on the interface today because `MachineSlotService` and the
remote command center already call them; anything beyond that
(`OTA`, `DISPLAY_CONTROL`, `REFRIGERATION_CONTROL`,
`REMOTE_CONFIGURATION`, `REMOTE_PRODUCT_UPDATE`) is deliberately **not**
on the interface at all yet — see `lib/vending/protocol/capabilities.ts`'s
own doc comment. Adding a method or a capability nothing in this
codebase reads yet would be exactly the speculative scaffolding the
brief warns against; the interface grows the next time a real caller
needs one of those, not ahead of it.

**Never assume an optional capability exists.** Every caller checks
`hasCapability(adapter.capabilities(), '...')` before acting —
`MachineCommandService.issueCommand`'s `CAPABILITY_FOR_COMMAND` gate,
the diagnostics page's "Test vend" button only rendering when `'vend'`
is declared, `IssueMachineCommandAction` only rendering when
`'remote_restart'` is declared.

## 4. Capability discovery — four states, not two

`capabilities()` never throws — discoverability is unconditional, even
for `ShengmaAdapter`'s empty stub. But a bare boolean map collapses two
very different facts into the same `false`: "this hardware genuinely
doesn't do this" and "nothing is wired behind this adapter at all
yet." `classifyCapabilityStatus` (`lib/vending/protocol/capabilities.ts`)
reads a fourth, real signal (`live.ok` — does a diagnostic call to the
adapter actually complete, or does it throw `ProtocolNotConfiguredError`)
and produces the four states the brief asks for:

| Status | Meaning | Real signal used |
|---|---|---|
| `unknown` | No adapter registered for this `manufacturer` at all | `defaultVendingAdapterResolver` threw `UnsupportedManufacturerError` |
| `not_configured` | An adapter exists, but no protocol is wired behind it (`ShengmaAdapter`'s stub) | a live diagnostic call threw `ProtocolNotConfiguredError` |
| `supported` | A configured adapter declares this capability `true` | `capabilities()[cap] === true` |
| `not_supported` | A configured adapter declares this capability `false` — a real decision | `capabilities()[cap] === false`, protocol configured |

The admin machine-detail diagnostics panel renders all four as
visually distinct badges (`CAPABILITY_STATUS_PRESENTATION` in
`app/admin/(protected)/vending/[machineId]/page.tsx`) rather than
collapsing back to a checkmark/circle. `tests/lib/hardwareCapabilities.test.ts`
covers all four transitions directly, including the case that matters
most: `ShengmaAdapter`'s `NO_CAPABILITIES` (every key `false`) must
read as `not_configured`, never `not_supported` — that `false` is not
a decision about Shengma's actual hardware.

## 5. Payment/hardware separation and the vend lifecycle

Hardware never knows which payment provider was used, and payment code
never calls a hardware method directly. `machineTransactionService`
sits between them, moving a transaction through exactly this
sequence — the same states named in the brief:

```
pending → paid  (PAYMENT_VERIFIED — verified server-side, before
                  authorizeVend is ever called; a device's own claim
                  is never proof of payment)
  → vend_authorized  (VEND_AUTHORIZED — adapter.authorizeVend returned
                       { authorized: true })
  → dispensed | paid_vend_failed | manual_review
     (VEND_EXECUTED / DISPENSE_CONFIRMED, or its normalized failure —
      applyVendResult reading VendResultReport.status)
```

`VendResultReport.status` (`DispenseResultStatus` —
`success | failed | timeout | unknown | jam | no_product |
sensor_failure | machine_offline`) is the normalized dispense
vocabulary the brief asks for. `dispensed: boolean` stays on the type
for every existing caller that only ever needed yes/no;
`status === 'success'` is what actually decides it now.
`applyVendResult` (`services/machineTransactionService.ts`) branches
three ways: `success` → `dispensed` (and the one inventory-movement
write a successful vend causes); `unknown` → `manual_review` (an
explicit "I don't know what happened" device report gets the same
human-reconciliation treatment `reconcileStuckTransactions`'s own
timeout sweep already gives to silence); every other named failure →
`paid_vend_failed`, with `dispenseFailureStatus` recording exactly
which one. **No non-success status ever decrements inventory** —
tested directly (`tests/services/machineTransactionService.test.ts`).

`DispenseConfirmationStrategy` (`drop_sensor | motor_completion |
elevator_confirmation | weight_sensor | controller_confirmation`,
`Machine.dispenseConfirmationStrategy`) records which physical method
a given machine's hardware actually uses to confirm a dispense — a
real, staff-recorded fact, kept descriptive rather than
behaviour-branching today because no two adapters this codebase has
real documentation for need to be treated differently yet. It exists
so a future adapter that *does* need to special-case one has somewhere
to read it from, per `lib/vending/hardwareAdapter.ts`'s own doc
comment.

## 6. Gateway architecture — what's real vs. what a real deployment needs

**Built:** per-machine bearer device authentication
(`lib/vending/deviceAuth.ts`, hashed secret, immediate revocation, no
Firestore access from a device — enforced independently in
`firestore.rules` too); an idempotent telemetry/vend-result ingest
path keyed on a caller-or-adapter-derived `idempotencyKey`; a
poll/ack/complete remote-command model (`MachineCommand`,
`GET /api/vending/commands` device poll, `.../ack`, `.../complete`)
that a real gateway's own scheduled poll loop would drive; a
`CloudTransport` abstraction (`lib/vending/protocol/cloudTransport.ts`)
already wired into `issueCommand` as a best-effort latency
optimisation over polling, with `NullCloudTransport` as the honest
today-default and `MockCloudTransport` proving the call happens.

**Not built, and not claimed to be:** there is no running gateway
*process* anywhere in this repository — no local cache-holding daemon,
no persisted offline transaction/telemetry queue that replays on
reconnect, no real MQTT/WebSocket broker behind `CloudTransport`. See
`docs/MACHINE_RUNTIME.md` § for exactly what a real gateway would need
to add and why building it now (with no physical device to run it on)
would be speculative. `scripts/vendingSimulator/SimulatedMachine`
exercises the real API surface a gateway would call, but its own
`goOffline()`/`comeBackOnline()` model "no request is sent right now,"
not "requests are queued locally and replayed later" — that gap is
named, not hidden.

## 7. Device security

Every device credential is a per-machine hashed bearer secret
(`deviceCredentialRepository`, `hashDeviceSecret`,
`timingSafeEqualStrings` — the same constant-time comparison the
Daraja/Whatchimp webhook routes use), rotatable
(`machineService.rotateDeviceCredential`) and immediately revocable
(`revokeDeviceCredential` — `listActiveByMachine`'s own query excludes
a revoked credential from the very next request, no separate cache to
also invalidate). Authorization is scoped per machine: a credential
authenticates *that one machine's* requests only —
`GET /api/vending/machines/{id}/catalog` 404s (never 403s, so it
reveals nothing) a request for any id other than the authenticated
token's own — so a compromised Machine A's credential cannot be
replayed against Machine B. Transport security is Vercel's own
HTTPS-everywhere, not an application-level concern this codebase adds
to. **Not built**: mutual TLS / device certificates, a credential
revocation *push* (a revoked device only stops working on its next
request, there's no active kick), and any hardware root-of-trust —
all real gaps for a production fleet at scale, not silently assumed
solved.

## 8. Shengma

`lib/vending/adapters/shengmaAdapter.ts` is an interface-conformant
stub: `capabilities()` returns `NO_CAPABILITIES` (every key `false`),
`authorizeVend` returns a normal refusal (`{ authorized: false,
reason: 'protocol not configured...' }`), and every other method
throws `ProtocolNotConfiguredError`. This is not partial Shengma
support — it is zero Shengma behaviour, implemented honestly rather
than faked. Shengma's control boards are publicly documented as
supporting MDB 4.2 and DEX/EVA-DTS (`lib/vending/protocol/mdb/frame.ts`,
`lib/vending/protocol/dex/parser.ts` — framing/parsing only, no
peripheral command table); their own proprietary API/SDK is not
documented for this project. **Real Shengma integration is not
complete and must not be claimed complete** until a specific
deployment identifies which protocol it actually exposes and that
protocol is tested against real hardware — see
`docs/MANUFACTURER_INTEGRATION_CONTRACT.md` § for exactly what
"integrated" would mean at that point.

## 9. Snack Quest Controller — deliberately not built this phase

The brief is explicit: do not build Controller V1 in this phase. What
this phase does guarantee is that a controller, when it exists, is
just another process that implements `VendingHardwareAdapter` against
real MDB/DEX/serial wiring and gets resolved through the same
`VendingAdapterResolver` every other adapter goes through — nothing in
the business layer, the API routes, or the admin UI changes when that
happens. See `docs/MANUFACTURER_INTEGRATION_CONTRACT.md` for the exact
contract such a controller (or any new manufacturer adapter) must
satisfy.

## 10. Cross-references

- `docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md` — protocol-layer
  history (MDB/DEX codecs, capability model's introduction, the
  protocol registry).
- `docs/MACHINE_RUNTIME.md` — the gateway/runtime perspective, offline
  behaviour, the simulator.
- `docs/MACHINE_CATALOG_RUNTIME.md` — the customer screen's own
  catalog contract, local cache model, machine isolation.
- `docs/MANUFACTURER_INTEGRATION_CONTRACT.md` — what a new
  manufacturer adapter must implement, and how it's tested before
  being trusted.
- `docs/INVENTORY_ARCHITECTURE.md` / `docs/MACHINE_ASSORTMENT.md` /
  `docs/MACHINE_COMMERCE.md` — the commercial/inventory layer this
  phase explicitly does not rebuild.

## Still NEXT/SCALE

Real MQTT/WebSocket transport; a running gateway process with a local
cache and a persisted offline queue that actually replays; mutual
TLS/device certificates; a real manufacturer integration tested
against physical hardware (Shengma or otherwise); Snack Quest
Controller V1; OTA, display control, and refrigeration control as
first-class capabilities (no reader exists for any of them yet);
fleet-scale load testing of the simulator itself.
