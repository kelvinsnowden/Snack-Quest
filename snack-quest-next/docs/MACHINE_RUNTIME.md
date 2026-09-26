# Machine runtime — the gateway's own perspective

`docs/VENDING_OS_ARCHITECTURE.md` maps the whole stack; this document
is the view from inside a machine's gateway — what it is responsible
for, what it can call today, and, honestly, what a real one still
needs that does not exist in this repository yet.

## 1. What a gateway is, here

A "gateway" is whatever process sits at the physical machine and talks
to the cloud: today that's `scripts/vendingSimulator/SimulatedMachine`
driven by a script, or, for a real deployment, hardware nobody has
built yet. It authenticates as one machine
(`buildDeviceAuthHeader(machineId, secret)` →
`Authorization: Bearer <machineId>:<secret>`, verified by
`authenticateDevice()` on every device-facing route) and is
responsible for:

1. Reporting itself in (heartbeat, telemetry, faults).
2. Fetching its own catalog and configuration.
3. Running the buy → authorize → dispense → report cycle.
4. Polling for, acknowledging, and completing remote commands.
5. Behaving correctly when the network is unreliable — retries,
   idempotency, no double-charge/double-vend.

Every one of those is a real HTTP call this repository implements and
tests against; none of them assumes a specific manufacturer, because
the gateway talks to the cloud API, not to hardware directly — the
manufacturer-specific part is `VendingHardwareAdapter`, which lives on
the *cloud* side for `authorizeVend`/`receiveVendResult` (payment
verification and dispense-result trust decisions belong server-side,
never in gateway firmware) and would live on the gateway/controller
side for anything that has to physically happen at the machine (MDB
framing, DEX polling) once a real controller exists.

## 2. The request/response surface a gateway drives today

| Concern | Route | Notes |
|---|---|---|
| Heartbeat/telemetry | `POST /api/vending/telemetry` | Idempotent on `idempotencyKey`; `heartbeat`/`fault`/`temperature`/`door_*`/`connectivity_*`/`stock_update` event types update `Machine.lastSeenAt` and nothing financial. |
| Own catalog | `GET /api/vending/machines/{id}/catalog` | See `docs/MACHINE_CATALOG_RUNTIME.md`. |
| Initiate a purchase | `POST /api/vending/payments` | `{ slotId, phoneNumber }` → STK push initiated server-side. |
| Poll payment/authorization | `GET /api/vending/payments/{id}` | Scoped to the caller's own machine — a machine can only poll its own transactions. |
| Report a dispense result | `POST /api/vending/transactions` | `VendResultReport` shape — `status`/`dispensed`/`failureReason`/`idempotencyKey`. See § VENDING_OS_ARCHITECTURE §5. |
| Poll pending commands | `GET /api/vending/commands` | Device-scoped; only this machine's own pending `MachineCommand`s. |
| Acknowledge / complete a command | `POST /api/vending/commands/{id}/ack`, `.../complete` | The poll → ack → execute → complete cycle a real gateway runs on a schedule. |

`scripts/vendingSimulator/SimulatedMachine` exercises every row above
through `InProcessRouteCaller`/a real HTTP `RouteCaller`, calling the
actual Route Handler functions — the same technique this codebase's
route tests already use — so it proves the real auth/validation/
service/Firestore path, not a mock of it.

## 3. Local machine catalog cache — the model, and what's actually built

The brief's model: a gateway holds a local cache of
`{ version, lastSyncedAt, products, prices, slots, availability }`,
compares `version` against the cloud's on each sync, treats a version
mismatch as "re-fetch," and falls back safely to its last-known-good
cache if the cloud is unreachable — cloud stays authoritative; the
machine never runs its own independent pricing/eligibility logic.

**What exists**: the cloud side of that contract, completely — a
deterministic `catalogVersion`
(`machineAssortmentService.getCatalogVersion`, § MACHINE_CATALOG_RUNTIME)
a gateway *could* compare against a value it cached from its last
fetch, and every item the gateway would need to render a screen or
validate a vend.

**What does not exist**: any actual gateway-side cache. There is no
running process in this repository that persists
`{version, lastSyncedAt, ...}` anywhere, compares it, or falls back to
it — because there is no real gateway to run that code on yet, and
writing a cache implementation with no machine to hold it would be
the same speculative-scaffolding mistake this codebase avoids
elsewhere (a `ShengmaAdapter` with guessed-at behaviour, an unused
`OTA` capability). When a real gateway is built, `catalogVersion`
being deterministic today is exactly what makes that cache
implementation possible without any cloud-side change.

## 4. Offline behaviour — what's proven, what's honestly missing

**Proven**: every write path a gateway would retry is idempotent.
`machineTelemetryEventRepository.recordIfNew` and the transaction
idempotency path both rely on Firestore's `.create()`-fails-on-duplicate
primitive — a retried heartbeat, vend-result report, or command
acknowledgement with the same `idempotencyKey` never double-applies.
`tests/scripts/vendingSimulator.test.ts`'s `sendDuplicateTelemetry`
and out-of-order telemetry cases exercise this against the real
emulator-backed services, not a mock. **Never double-charge or
double-vend because of retry behaviour** holds today because payment
verification and `authorizeVend` both happen server-side, gated by the
transaction's own state machine (`MACHINE_TRANSACTION_STATUS_TRANSITIONS`)
— a retried report of an already-`dispensed` transaction has nowhere
further to move it.

**Honestly missing**: a persisted local queue that holds
requests/events made while offline and replays them on reconnect.
`SimulatedMachine.goOffline()` models "the gateway stops sending
anything right now" (every call becomes a no-op reporting `sent: false`
or `initiated: false`) — it does **not** model "the gateway queued
those events locally and sends them all once `comeBackOnline()` is
called." A real gateway's offline queue, retry backoff, and
credential/config caching for use while offline are all real,
un-built work — named here rather than glossed over, matching this
codebase's own discipline for `ShengmaAdapter` and the MDB peripheral
command table.

## 5. Machine configuration sync

`Machine`'s own fields (`status`, `inventoryReserveTargetKes`,
`dispenseConfirmationStrategy`, location fields, ...) are the
configuration a gateway would sync — written only by a Service under
the Admin SDK, never by the device itself (§ VENDING_OS_ARCHITECTURE
§7's own security model). There is no versioned "config bundle" a
gateway fetches and applies atomically yet, because there is no
gateway process to apply one — the brief's "do not partially apply an
invalid configuration" requirement is satisfied *by construction*
today (a device never writes its own config, so there is nothing for
it to partially apply), not by a validated-bundle mechanism that
doesn't exist. That mechanism becomes real work once a gateway needs
to pull more than the individual fields the poll/command routes
already expose.

## 6. Diagnostics

The admin machine-detail page's "Capabilities & integration
diagnostics" card is the staff-facing runtime view: protocol/registry
status, the four-state capability read (§ VENDING_OS_ARCHITECTURE §4),
a live status/slot/fault/temperature read through the resolved
adapter when one is configured, `Catalog version` (the same
deterministic value § 3 above describes), `Last vend` and `Last fault`
(derived from the same transaction/telemetry data the page already
fetches — not a new query), and **Test vend**: a real, live
`authorizeVend` call, gated to `ADMIN_ONLY`
(`app/api/vending/machines/{id}/testVend`) rather than the
`ADMIN_FINANCE_OR_WAREHOUSE` role every other diagnostic read on this
page uses, because this is the one action here with a genuine physical
consequence — it really attempts to dispense, not a simulation. The
client component (`TestVendAction`) adds a `confirm()` prompt on top
of that server-side gate as deliberate friction, not a substitute for
it.

## Still NEXT/SCALE

A real gateway process; a persisted local cache and offline
queue-and-replay; a versioned configuration-bundle sync mechanism;
retry/backoff tuning against real network conditions; fleet-scale load
testing of the simulator itself (100s–10,000s of simulated machines
against a live deployment) — the `RouteCaller` interface is
transport-agnostic so this is designed for, but a standalone
TypeScript-execution story (`tsx`/`ts-node`) this repo doesn't have yet
blocks actually running it that way.
