# Vending Foundation — backend/domain layer for Discovery Machine integration

This is the report the vending-foundation brief asked for at the end of
the task: what was built, what it lets a hardware vendor and a future
UI plug into, and what is deliberately not here yet. It complements
`docs/FLEET_ARCHITECTURE_AUDIT.md` (the design) and
`docs/ANALYTICS_ROLLUPS.md` (the rollup primitives this reuses) rather
than repeating them.

**Scope discipline, stated up front:** nothing below migrates Firebase,
introduces a second backend, or rebuilds any existing system. Every
file listed is either new or a small additive change to a shared
config file (`firestore.rules`, `firestore.indexes.json`,
`lib/auth/requireStaffRole.ts`, `types/common.ts`, `types/index.ts`,
`vercel.json`). No existing collection, service, or route was modified
or repurposed.

## 1. Files changed

**Types** (`types/`, 12 new + 2 edited):
`machine.ts`, `machineSlot.ts`, `machineTransaction.ts`,
`machineInventoryMovement.ts`, `machineTelemetryEvent.ts`,
`machineLocationHistory.ts`, `restockTask.ts`, `partner.ts`,
`partnerMachineAgreement.ts`, `machineSettlement.ts`,
`deviceCredential.ts`, `machineDailySummary.ts`,
`partnerDailySummary.ts` — plus `common.ts` (added the `partner` role)
and `index.ts` (barrel exports) edited.

**Repositories** (`repositories/`, 13 new): `machineRepository.ts`,
`machineSlotRepository.ts`, `machineTransactionRepository.ts`,
`machineInventoryMovementRepository.ts`,
`machineTelemetryEventRepository.ts`,
`machineLocationHistoryRepository.ts`, `restockTaskRepository.ts`,
`partnerRepository.ts`, `partnerMachineAgreementRepository.ts`,
`machineSettlementRepository.ts`, `deviceCredentialRepository.ts`,
`machineDailySummaryRepository.ts`, `partnerDailySummaryRepository.ts`.

**Services** (`services/`, 8 new): `machineService.ts`,
`machineSlotService.ts`, `machineTransactionService.ts`,
`machineInventoryMovementService.ts`, `machineTelemetryService.ts`,
`partnerService.ts`, `machineSettlementService.ts`,
`vendingRollupService.ts`.

**Hardware abstraction and device auth** (`lib/vending/`, 6 new):
`hardwareAdapter.ts` (the `VendingHardwareAdapter` interface),
`adapters/mockVendingAdapter.ts`, `adapterRegistry.ts`,
`deviceAuth.ts`, `connectivity.ts`, `serialize.ts`.

**API routes** (`app/api/`, 8 new route files): `vending/register`,
`vending/telemetry`, `vending/transactions`,
`vending/machines/[id]`, `vending/machines/[id]/slots`,
`vending/restock`, `vending/analytics`, `cron/rebuild-vending-rollups`.

**Shared config, edited additively**: `firestore.rules` (new match
blocks + two helper functions, nothing existing changed),
`firestore.indexes.json` (14 new composite indexes),
`lib/auth/requireStaffRole.ts` (one new role constant,
`ADMIN_FINANCE_OR_WAREHOUSE`), `vercel.json` (one new cron entry).

**Tests** (`tests/`, 17 new files, 189 tests): 7 service test files,
2 `lib/` test files, 1 Firestore rules test file, 7 API route test
files. All pass; see §6.

## 2. Collections and indexes added

13 new collections: `machines`, `machineSlots`, `machineTransactions`,
`machineInventoryMovements`, `machineTelemetryEvents`,
`machineLocationHistory`, `restockTasks`, `partners`,
`partnerMachineAgreements`, `machineSettlements`, `deviceCredentials`,
`machineDailySummary`, `partnerDailySummary`. Every one is additive;
`machineSlots`/`machineTransactions` reference the **existing**
`packages`/`snackItems` catalogue by id, never a second product table.

14 composite indexes added to `firestore.indexes.json`, covering the
queries the repositories and rollup service actually issue:
`machines` (businessId+status+createdAt; businessId+createdAt),
`machineTransactions` (businessId+machineId+createdAt;
businessId+status+createdAt; businessId+machineId+status+createdAt;
businessId+createdAt), `machineInventoryMovements`
(businessId+reason+machineId+createdAt), `machineTelemetryEvents`
(businessId+machineId+eventType+receivedAt), `restockTasks`
(businessId+machineId+createdAt; businessId+status+createdAt),
`machineDailySummary` (businessId+machineId+date),
`partnerDailySummary` (businessId+partnerId+date),
`machineSettlements` (businessId+partnerId+periodStart;
businessId+machineId+periodStart).

**Known gap, honestly flagged**: a few query shapes exist in the
repositories but aren't exercised by any route or rollup yet, so no
index was added speculatively for them — `restockTaskRepository.listOpenByMachine`'s
`status IN [...]` filter, and a fleet-wide (no `machineId`) call to
`machineTransactionRepository.streamRange`/`machineTelemetryEventRepository.streamRange`.
The Firestore emulator doesn't enforce indexes the way production
does, so these passed every test here without one; add the matching
index the first time a real caller needs that exact shape, rather than
guessing at indexes nothing calls yet.

## 3. API endpoints added

All under `/api/vending/*` plus one cron route. Device-facing routes
authenticate with `authenticateDevice()` (`Authorization: Bearer
<machineId>:<secret>`); staff-facing routes authenticate with the
existing `verifyStaffSessionFromRequest` + `hasStaffRole` pattern every
`/api/admin/**` route already uses.

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/vending/register` | POST | staff (admin/warehouse) | Provisions a machine, issues its one-time device credential |
| `/api/vending/telemetry` | POST | device | Non-financial telemetry ingest (heartbeat/fault/status/…) |
| `/api/vending/transactions` | POST | device | A device's own vend-result report — the only transaction write a device can reach |
| `/api/vending/transactions` | GET | staff (admin/finance/warehouse) | Paginated transaction list |
| `/api/vending/machines/[id]` | GET | staff (admin/finance/warehouse) | One machine's detail, with derived connectivity status |
| `/api/vending/machines/[id]/slots` | GET | staff (admin/finance/warehouse) | A machine's slots |
| `/api/vending/machines/[id]/slots` | PATCH | staff (admin/warehouse) | Price/enable updates — writes Firestore and the hardware adapter together |
| `/api/vending/restock` | GET | staff (admin/warehouse) | A machine's restock tasks (open or all) |
| `/api/vending/restock` | POST | staff (admin/warehouse) | Records a real inventory movement, optionally closing a restock task |
| `/api/vending/analytics` | GET | staff (admin/finance/warehouse) | Machine- or partner-scoped daily rollups, self-healing on read |
| `/api/cron/rebuild-vending-rollups` | GET | `CRON_SECRET` bearer | Nightly rebuild of the last 3 days of rollups, fleet-wide |

**Interpretation call worth stating explicitly**: the brief named
"transactions" as one endpoint without specifying which half of the
payment flow it covers. I resolved it as the device's vend-result
report (POST) plus a staff list view (GET) — not a customer-facing
checkout endpoint. Creating a pending transaction and verifying payment
remain service-layer methods (`machineTransactionService.createPending`/
`markPaymentVerified`) with no route yet, per the brief's own "for now,
build the domain/API contracts necessary for this flow" — wiring them
to a real checkout means either extending the existing Daraja flow or
designing a new customer-facing one, which is a product decision this
task wasn't scoped to make.

## 4. Security model

- **Device identity**: `deviceCredentials` — a machine-scoped bearer
  secret, SHA-256 hashed at rest (`hashDeviceSecret`), never stored or
  logged in plaintext. `authenticateDevice()` looks up only that one
  machine's active credentials (never a fleet-wide scan), compares
  with `timingSafeEqualStrings` (the same constant-time comparison the
  Daraja/Whatchimp webhooks already use), and records `lastUsedAt` on
  success.
- **Rotation/revocation**: `machineService.rotateDeviceCredential`
  issues a new secret without invalidating the old one until the
  device picks it up (brief overlap, not a hard cutover);
  `revokeDeviceCredential` sets `revokedAt` and is immediate — the very
  next request with that secret is rejected, no cache to also
  invalidate.
- **Auditability**: every credential ever issued stays in
  `deviceCredentials`, revoked or not (`deviceCredentialRepository.listByMachine`);
  nothing is deleted.
- **Idempotency**: `machineTelemetryEventRepository.recordIfNew` uses
  Firestore's own `.create()`-fails-on-duplicate primitive (error code
  6), the same one `webhookEventRepository.recordIfNew` already uses —
  proven under real concurrency in `tests/services/machineTelemetryService.test.ts`'s
  `Promise.all` test, not just sequentially.
- **Financial correctness**: `machineTransactionService.markPaymentVerified`
  is the only method that can move a transaction to `paid`, and no
  device-facing route calls it — `POST /api/vending/transactions` can
  only reach `applyVendResult`, which can move `paid`/`vend_authorized`
  to `dispensed`/`paid_vend_failed`, never create a transaction or mark
  one paid. `MACHINE_TRANSACTION_STATUS_TRANSITIONS` enforces this at
  the repository layer regardless of what any caller intends.
  `tests/api/vendingTransactionsRoute.test.ts` mocks only
  `applyVendResult` on the transaction service — a route that reached
  for `createPending`/`markPaymentVerified` would throw "not a
  function," which is the test's proof that no such code path exists.
- **No direct Firestore access from a machine, ever**: every device
  interaction is Route Handler → Service → Repository → Admin SDK.
  `firestore.rules` makes this the *second*, independent enforcement:
  every vending collection is `allow write: if false` for every client
  session, staff or partner, admin included.
- **RBAC**: `ADMIN_OR_WAREHOUSE` gates provisioning and price/stock
  mutations; `ADMIN_FINANCE_OR_WAREHOUSE` (new) gates financial/status
  reads. `Role` now includes `'partner'`; `hasPartnerAccess()` and
  `machineOwnerPartnerId()` in `firestore.rules` enforce "partner A
  cannot read machine M006" independently of the route layer —
  see §Isolation of `FLEET_ARCHITECTURE_AUDIT.md` for the exact case
  this closes, and `tests/rules/vendingFleet.test.ts` for the test
  named after it. No partner login flow or partner UI exists — per the
  brief's own instruction, this is deliberately not built yet. What
  exists is the type, the Firestore rule, and the service-layer
  primitive (`machineService.assertPartnerOwnsMachine`) a future
  partner session slots into without any of the three changing shape.

## 5. Hardware abstraction

`VendingHardwareAdapter` (`lib/vending/hardwareAdapter.ts`) is the
only thing any Service talks to — never a manufacturer SDK directly.
Outbound methods (`authorizeVend`, `setPrice`, `enableSlot`, …) are
`async`; `receiveVendResult`/`receiveTelemetry` are pure synchronous
parsers, mirroring `PaymentGateway.verifyCallback`'s existing split in
this codebase. `MockVendingAdapter` is the only implementation today
(`Machine.manufacturer: 'mock'`), stateful in memory so it can actually
refuse an empty/disabled slot or an offline machine rather than always
succeeding.

**Update, see `docs/HARDWARE_COMPATIBILITY_ARCHITECTURE.md`:** `manufacturer:
'shengma'` now resolves to `ShengmaAdapter` — an honest,
interface-conformant stub with every capability declared `false`,
not the `UnsupportedManufacturerError` this section originally
described. No Shengma-specific protocol behaviour was added; the stub
exists so the admin UI and the business layer can talk about a
Shengma machine at all (capabilities, diagnostics) without pretending
any of it works. `manufacturer: 'other'` still throws
`UnsupportedManufacturerError` — there is no manufacturer to name a
stub after. This is still exactly the brief's original discipline: "do
not implement undocumented Shengma endpoints," just expressed as a
richer, capability-transparent refusal instead of a bare exception.

**What's blocked on Shengma's documentation, explicitly**:
- A `ShengmaVendingAdapter implements VendingHardwareAdapter` — every
  method signature is already fixed by the interface, so this is
  additive work once the API is known, not a redesign.
- Whether Shengma's own vend-result/telemetry webhook format needs a
  dedicated parser inside that adapter (near-certain) and what its
  authentication scheme is (a shared secret? mTLS? a per-device key
  like this codebase's own?) — `deviceAuth.ts`'s bearer-token scheme
  is Snack Quest's own, used regardless of manufacturer; if Shengma's
  gateway can be configured to call *this* codebase's routes with that
  scheme, no changes are needed there. If Shengma insists on its own
  webhook shape calling directly into a Shengma-defined endpoint, a
  new route and translation layer would be needed — undetermined
  without their docs.
- Whether Shengma's hardware enforces price/inventory itself or trusts
  the caller — `MockVendingAdapter.setPrice`/`authorizeVend` assume the
  former (the same assumption `MachineSlotService`'s own doc comment
  flags as "the kind of assumption this abstraction exists to
  isolate").
- Real network/latency/offline characteristics — `VendingHardwareAdapter`'s
  outbound methods are all `async` specifically so a slow or flaky real
  adapter doesn't require a signature change, but no retry/backoff
  policy is implemented because no real failure mode is known yet
  (see §Offline behaviour below).

## 6. Tests and results

17 new test files, 189 tests, all passing:

- **Services** (7 files): `machineService` (provisioning, status state
  machine, relocation, credential rotation/revocation, partner
  authorization boundaries, fleet summary), `machineSlotService`
  (price/enable updates touching both Firestore and the adapter,
  `configureSlot` preserving quantity/enabled across a re-config),
  `machineTransactionService` (the financial core — pending, payment
  verification, vend authorization success/failure, idempotent vend-
  result application, concurrent-duplicate proof, refund path),
  `machineInventoryMovementService` (restock/sale ledger correctness,
  insufficient-stock refusal, auto-opened restock tasks at the low-
  stock threshold, reconciliation match/mismatch), `machineTelemetryService`
  (heartbeat updating `lastSeenAt`, duplicate-delivery idempotency
  including a genuine `Promise.all` race, malformed-payload rejection,
  per-machine key scoping), `partnerAndSettlementService` (partner
  creation/listing, machine ownership scoping, gross-sales computation
  from real transactions, settlement figures staying null until an
  active agreement supplies a real revenue-share percentage),
  `vendingRollupService` (machine-day and partner-day rollup
  correctness against real transactions/movements/telemetry,
  idempotent rebuilds, today-is-never-persisted, partner-portfolio
  composition and self-healing).
- **Hardware/device auth** (2 files): `mockVendingAdapter` (slot
  authorization success/failure paths, offline refusal, payload
  parsing, adapter registry resolution), `vendingDeviceAuth` (bearer
  token parsing, per-machine credential scoping, revocation).
- **Firestore rules** (1 file): 24 tests including the audit's own
  named case — partner A blocked from a machine owned by partner B —
  plus every staff-only collection confirmed to reject a partner read
  even for their own machine's data.
- **API routes** (7 files): every route's auth gate (401/403), input
  validation (400), and error-to-status mapping, plus the explicit
  malicious-payload test the brief asked for:
  `tests/api/vendingTransactionsRoute.test.ts`'s "a malicious or
  malformed device payload is rejected and never reaches a transaction
  as a completed sale."

**Full-suite regression**: `npm test` (the whole project, emulator-
backed) — **236 test files, 2,612 tests, all passing**. `npx tsc
--noEmit` — clean. `npx eslint .` — clean except the same 2
pre-existing warnings from before this work (`deliveryService.ts`,
`smtpEmailGateway.test.ts`), neither touched here. `npx next build` —
succeeds, all 8 new routes registered with no conflicts.

**Brief's 14-item + malicious-payload checklist, mapped**:

| Item | Where |
|---|---|
| Machine creation | `machineService.test.ts` |
| Device authentication | `vendingDeviceAuth.test.ts` |
| Duplicate telemetry | `machineTelemetryService.test.ts` |
| Duplicate transactions | `machineTransactionService.test.ts` |
| Vend success | `machineTransactionService.test.ts`, `vendingRollupService.test.ts` |
| Vend failure | `machineTransactionService.test.ts`, `vendingRollupService.test.ts` |
| Inventory movements | `machineInventoryMovementService.test.ts` |
| Stock reconciliation | `machineInventoryMovementService.test.ts` |
| Price updates | `machineSlotService.test.ts` |
| Machine status/heartbeat | `machineService.test.ts`, `machineTelemetryService.test.ts` |
| Offline/retry behaviour | `mockVendingAdapter.test.ts`, `machineTelemetryService.test.ts` (retry = duplicate delivery) |
| Partner authorization boundaries | `machineService.test.ts`, `vendingFleet.test.ts` |
| Rollup correctness | `vendingRollupService.test.ts` |
| Idempotency | `machineTelemetryService.test.ts`, `machineTransactionService.test.ts` |
| Malicious/incorrect device payload | `machineTransactionService.test.ts`, `vendingTransactionsRoute.test.ts` |

## 7. Explicitly out of scope / deferred

**Update**: M-Pesa payment initiation for vending (`POST /api/vending/payments`,
the Daraja webhook route's vending branch, the transaction-timeout
sweep) was built in the phase that followed this report — see
`docs/VENDING_OS_BENCHMARK.md`'s own "Phase 1 — implemented" section
for what shipped and why the design differs from what a naive reading
of "add a payment endpoint" would produce (one shared Daraja callback
URL per business, not a second one). The items below are otherwise
still accurate.

- **No Shengma adapter** — see §5. Nothing here guesses at their API.
- **No customer-facing *screen* driving the checkout endpoint** — the
  API contract now exists and is real (unlike when this line was
  first written); what's still missing is the machine-side touchscreen
  that would call it, which is screen-CMS/SCALE-bucket work.
- **No partner login/session/UI** — per the brief's own instruction.
  The type, Firestore rule, and service primitive exist; the session
  that would issue a `partnerId` claim does not.
- **No settlement finalization/payout flow** — `machineSettlementService.createDraft`
  computes real gross sales and leaves every commercial-term figure
  null until an agreement exists, per the brief's "do not invent
  commercial terms." Moving a settlement from `draft` to `finalized`/`paid`
  is unbuilt, matching `FLEET_ARCHITECTURE_AUDIT.md`'s own "settlement
  modelling deliberately deferred."
- **No load testing at fleet scale** (50/100/500 machines) — the same
  gap `FLEET_ARCHITECTURE_AUDIT.md` §7 already flagged as not yet done,
  now also true of `rebuild-vending-rollups`'s own per-machine fan-out.
- **No refund reversal** — `requestRefund`/`markRefunded` record the
  state; nothing here calls Daraja's B2C reversal. The existing
  `refunds`/`orders` refund flow was not extended to cover vending
  transactions, since the two are deliberately separate collections
  (see `machineTransaction.ts`'s own doc comment).

Nothing in this list is a bug — each is a boundary the brief itself
drew, restated here so the next phase knows exactly where the domain
foundation stops and a product decision starts.
