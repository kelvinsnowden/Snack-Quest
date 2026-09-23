# Snack Quest Cloud vs. the VEM benchmark — gap analysis and Phase 1 plan

Written before any Phase 1 code, against the actual state of this
repository (branch `claude/review-improvements-udxkqz`, commit
`1461ff7` and its own `docs/VENDING_FOUNDATION.md`/
`docs/FLEET_ARCHITECTURE_AUDIT.md`), not against a fresh design. VEM
Cloud is used here only as a named capability checklist — nothing in
this document or the code that follows it copies VEM's implementation,
API shapes, UI, or branding. Where a capability below is described
"the way VEM does it," that means the *publicly documented category of
capability* (device registration, MQTT, heartbeat, telemetry, etc.),
not anything reverse-engineered from VEM's own system.

## 0. Internal gap analysis

```
EXISTING   — built, working, tested, and correct as designed
KEEP       — existing design is right; do not touch
EXTEND     — existing design is right; add to it, don't replace it
REFACTOR   — existing design needs to change shape
MISSING    — does not exist yet
RISKY      — exists or is planned, but carries a real hazard to call out
```

| Capability | Verdict | Why |
|---|---|---|
| Machine identity, provisioning, credentials | EXISTING / KEEP | `Machine`, `machineService.provisionDevice`, `deviceCredentials` (hashed secret, rotation, immediate revocation). Matches or exceeds the benchmark's device-registration requirement. |
| Machine status lifecycle | EXISTING / KEEP (see rationale below) | 7-state `MachineStatus` (`provisioning→installing→testing→active→maintenance→offline→decommissioned`) plus a **separately derived** `MachineConnectivityStatus` (`online/stale/offline/unknown`) from `lastSeenAt`. This is deliberately *not* the same shape as the benchmark's single linear lifecycle, and that's correct: collapsing "is this machine physically installed" and "is it connected right now" into one enum makes "online" and "offline" transient states that would flap on every dropped heartbeat — exactly the anti-pattern §21 of the brief warns about for events, applied here to status. Keep the split. |
| Hardware abstraction | EXISTING / KEEP-then-EXTEND-later | `VendingHardwareAdapter` (`getMachineStatus`, `getSlots`, `getInventory`, `setPrice`, `enableSlot`, `disableSlot`, `authorizeVend`, `receiveVendResult`, `receiveTelemetry`, `getTemperature`, `getFaults`) + `MockVendingAdapter`. Covers every NOW-bucket need. `connect/disconnect/restart/lock/unlock/updateConfiguration/updateFirmware/cancelVend` from the brief's sketch are real capabilities but belong to the remote-command layer, which is NEXT-bucket by the brief's own phasing — adding them to the interface now would be speculative surface with no caller. |
| Manufacturer-agnostic adapter registry | EXISTING / KEEP | `adapterRegistry.ts` throws `UnsupportedManufacturerError` for `shengma`/`other` rather than guessing at an undocumented API. This is already exactly the discipline §23 of the brief asks for. |
| Vend transaction state machine | EXISTING / EXTEND | 8 states already separate payment fact from dispense fact (`paid` vs `dispensed` vs `paid_vend_failed`), which is the brief's own most-emphasized requirement (§6) and is already correct. **Real gap**: nothing resolves a transaction stuck in `paid`/`vend_authorized` forever (machine went offline mid-vend). See §D/§H below — this is the one state-machine change Phase 1 makes. |
| Slot-level inventory + movement ledger | EXISTING / KEEP | `MachineSlot` (cache) + `MachineInventoryMovement` (immutable ledger, 5 reasons) + `reconcile()`. Matches the benchmark and the brief's own §8 exactly. |
| Restocking | EXISTING / EXTEND (later) | Auto-opened `RestockTask` at a configurable low-stock threshold exists. "Restock intelligence" (velocity, days-remaining, recommended quantity — brief §9) does not exist and needs real sales volume to be meaningful — SCALE-bucket, not Phase 1. |
| Telemetry / event model | EXISTING / KEEP | `MachineTelemetryEvent` is already immutable, append-only, idempotency-keyed, schema-loose (`payload: Record<string, unknown>`), exactly matching brief §5's event model. 10 event types already cover heartbeat/status/fault/temperature/door/connectivity/vend_result/stock_update. |
| Idempotent device ingest | EXISTING / KEEP | `machineTelemetryEventRepository.recordIfNew` and the transaction-idempotency path both use Firestore's `.create()`-fails-on-duplicate primitive, proven under real concurrency in tests. |
| Device authentication | EXISTING / KEEP | Per-machine hashed bearer secret, `timingSafeEqualStrings`, immediate revocation, full audit trail. No machine ever writes Firestore directly — enforced at the route layer *and* independently in `firestore.rules`. |
| Partner isolation | EXISTING / KEEP | `partner` role, `hasPartnerAccess()`/`machineOwnerPartnerId()` in `firestore.rules`, `machineService.assertPartnerOwnsMachine`, tested directly against "partner A reading partner B's machine." No partner login/UI yet — correctly deferred. |
| Analytics rollups | EXISTING / KEEP | `machineDailySummary`/`partnerDailySummary`, reusing the exact `AnalyticsRequestCache` + daily-rollup + self-heal-on-read primitives already proven for e-commerce analytics. This *is* the "immutable events → aggregation → rollups → fast dashboards" architecture the brief's §21 asks for, already built, not a new one to invent. |
| Payments | **MISSING for vending** (EXISTING at platform level) | `PaymentGateway`/`darajaGateway` (STK push, callback verification, stuck-payment reconciliation sweep) is a mature, production-hardened, already-provider-agnostic abstraction — see §C. It is simply **never called by anything in the vending domain.** `machineTransactionService.createPending`/`markPaymentVerified` are orphaned methods with no route and no Daraja wiring. This is the single most important Phase 1 gap. |
| Command model / remote operations | MISSING | No `command_id`/audit trail, no restart/lock/unlock/sync. Correctly NEXT-bucket per the brief's own phasing — no route or transport exists to deliver a command to a machine yet, and building one before a real or simulated device can receive it would be speculative. |
| Real-time transport (MQTT/WebSocket) | MISSING | No `DeviceTransport` abstraction exists; every device interaction today is request/response HTTP (device calls in, server responds). Correct for Phase 1 — heartbeat/telemetry/vend-result over HTTP is sufficient until a command-and-control channel is actually needed, which is NEXT-bucket. |
| Screen CMS / promotions | MISSING | Zero code. SCALE-bucket per the brief's own phasing — no machine has a screen yet. |
| Machine-level economics (P&L) | MISSING | `machineSettlementService` computes real gross sales; it does not yet net out fees/costs into a contribution figure. NEXT-bucket — meaningless before real transaction volume exists. |
| Location intelligence | MISSING | `Machine.locationId/latitude/longitude/address/venueName` + `MachineLocationHistoryEntry` already exist as fields, but there is no `locations` collection with venue/footfall/audience metadata. NEXT-bucket. |
| Admin UI for vending | **MISSING** | Zero pages under `app/admin`. Every capability above is API-only. A minimal machine list + detail view is realistically part of "first physical prototype support" (brief §31's own NOW list names it) — scoped tightly in Phase 1, see §H. |
| Simulator | **MISSING** | Explicitly called out by the brief (§24) as the thing to build *before* touching physical hardware, and explicitly in the NOW bucket. Phase 1 item. |
| Fleet-scale load testing | MISSING, flagged twice already | Both `FLEET_ARCHITECTURE_AUDIT.md` §7 and `VENDING_FOUNDATION.md` §7 already name this as not done. The simulator (above) is what makes it possible; running it at 100/1,000/10,000 machines is SCALE-bucket, not Phase 1 — Phase 1 proves the simulator works at a small N. |
| Observability (§20 of the brief) | RISKY | `scheduledJobRuns` gives cron-level observability; nothing yet tracks command latency, vend success rate, or payment success rate as first-class metrics. Not urgent at zero transaction volume, but should not be left until 500 machines exist either — flagged as a NEXT-bucket item, not ignored. |
| Reusing `PaymentIntent`/`ConversationService` for vending | RISKY — decided against | `PaymentIntent.createIntent` *requires* `conversationId`/`conversationCheckoutSnapshotId` — it is structurally a WhatsApp-checkout artifact, not a generic "collect money" primitive. Forcing a vending purchase through it would mean fabricating a fake conversation per vend. See §C for what Phase 1 does instead. |
| One shared Daraja callback URL per business | RISKY — designed around, not worked around | `darajaGateway.initiateStkPush` always sends `CallBackURL: config.callbackUrl`, a single URL registered with Safaricom per business (`lib/integrations/daraja/config.ts`). **A vending STK push cannot use a different callback URL than the existing checkout flow uses** — Safaricom was never told a second URL exists. Phase 1's payment design branches inside the *existing* webhook route rather than adding a second one Safaricom would never call. See §E/§F. |

## A. Current architecture summary

Next.js App Router on Vercel, Firebase Auth + Firestore (Admin SDK
server-side only; the client SDK touches nothing but auth and one
narrow rules-enforced read), Vercel Blob for files. Zero
`onSnapshot` listeners, zero Cloud Functions, zero client-side
Firestore reads. Repository layer (13 vending repositories on top of
~49 pre-existing) wraps every query; Service layer (8 vending services
on top of ~43 pre-existing) holds business rules; Route Handlers are
thin wire. Every Gateway integration (Daraja, Whatchimp, TextSMS,
couriers, storage) sits behind a narrow interface in
`lib/integrations/types.ts`, with the concrete provider swappable
without touching a Service — the exact shape the vending brief asks
for at the hardware layer, already proven at the payment/messaging/
courier layer for two years of production use.

The vending domain (built in the immediately preceding session, not
this one) is additive: 13 new Firestore collections, 13 repositories,
8 services, a `VendingHardwareAdapter` interface + mock, per-machine
device bearer auth, 8 API routes, `machineDailySummary`/
`partnerDailySummary` rollups reusing the same primitives the
e-commerce analytics rollups use, and a `partner` RBAC role enforced
in `firestore.rules` independently of the service layer. Nothing
existing was migrated, rebuilt, or repurposed. 236 test files / 2,612
tests passing; `tsc`/`eslint`/`next build` all clean.

What's missing is not a redesign — it's the thin, specific set of
things nobody has built yet: vending actually **taking money**
(nothing calls Daraja), a **simulator** to test any of this without
physical hardware, and an **admin UI** to look at any of it without
curling the API.

## B. VEM benchmark gap analysis

| Capability | Current Snack Quest | VEM Benchmark | Proposed Snack Quest |
|---|---|---|---|
| Device registration/provisioning | Full: hashed per-device credentials, rotation, revocation, audit trail | Documented device init | Keep as-is — already exceeds a bearer-token baseline with hash-at-rest and immediate revocation |
| REST API | 8 routes, consistent auth/validation, no versioning yet | REST over HTTPS | Keep; add versioning discipline (§E) as routes grow past Phase 1 |
| Real-time MQTT | None | MQTT bidirectional | Deliberately deferred (NEXT) — HTTP request/response covers heartbeat/telemetry/vend-report today; add `DeviceTransport` abstraction only when a real push-command need exists |
| Heartbeat | `heartbeat` telemetry event → `Machine.lastSeenAt`; connectivity derived, not stored | Heartbeat | Keep |
| Telemetry | Immutable, idempotent, 10 event types, append-only | Telemetry | Keep |
| Machine status | Lifecycle status + derived connectivity, correctly separated | Status | Keep — do not collapse into one enum |
| Fault/alarm reporting | `fault` telemetry event type exists; no alert engine yet | Fault/alarm reporting | Alert center is NEXT-bucket; the event type it will read from already exists |
| Remote commands | None | Remote commands + ack | NEXT — needs a transport and a command model neither of which exist; do not build ahead of a caller |
| Order lifecycle | 8-state transaction state machine, payment/dispense separated | Order lifecycle | EXTEND with a timeout→manual_review path (Phase 1); otherwise keep |
| Dispense confirmation | `applyVendResult`, idempotent, device-authenticated | Dispense confirmation | Keep |
| Refunds/exceptions | `requestRefund`/`markRefunded` record state; no reversal call wired | Refunds | Keep the state; wiring an actual Daraja reversal is NEXT (needs real transaction volume to justify) |
| Slot-level inventory | Full ledger + reconciliation | Inventory | Keep |
| Restocking | Auto-opened low-stock tasks | Restocking | "Restock intelligence" (velocity/lead-time) is SCALE — meaningless before real sales data |
| Analytics | Daily rollups, request-scoped cache, self-healing | Analytics | Keep the primitive; richer cross-cuts (§22 of the brief) are SCALE, need real data |
| Promotions | None | Promotions | SCALE — no screen to display them on yet |
| Visual screen management | None | Screen CMS | SCALE — no machine has a screen yet |
| OTA updates | None | OTA | SCALE — no firmware update path exists for any manufacturer yet |
| Mobile field operations | None | Mobile ops | NEXT — needs real restocking volume to justify a dedicated mobile flow |
| Multi-tenant | `businessId` scoping already platform-wide | Multi-tenant | Keep |
| RBAC | admin/super_admin/agent/warehouse/finance/**partner** | RBAC | Keep; `ADMIN_FINANCE_OR_WAREHOUSE` already added |
| Fleet management | API-complete; **zero UI** | Fleet management | Phase 1 builds a minimal machine list + detail page — not the full "operations center," which needs alerts/economics that don't exist yet |
| **Payments (M-Pesa)** | **Daraja `PaymentGateway` exists and is production-hardened; not called by vending** | Not in VEM's public scope (Snack Quest goes beyond) | **Phase 1**: wire vending to the existing `PaymentGateway`, not a new abstraction |
| **Simulator** | **None** | Not in VEM's public scope | **Phase 1**: build one — explicit prerequisite to touching real hardware |

## C. Recommended architecture

**Keep the layering exactly as it is**: Route Handler → Service →
Repository → Admin SDK, for every new piece below. No new
architectural layer is introduced.

**Payments**: do not build a new `PaymentProvider`/`MpesaPaymentProvider`
abstraction. `lib/integrations/types.ts`'s `PaymentGateway` interface
*is* that abstraction already — `initiateStkPush`/`verifyCallback`/
`queryStkStatus`, implemented today by `darajaGateway`, swappable for
a card provider later without touching a Service. `machineTransactionService`
gains a constructor-injected `PaymentGateway` dependency (same DI
pattern it already uses for `VendingAdapterResolver`), and two new
methods: `initiateMpesaPayment` (create pending + STK push,
persisting `checkoutRequestId`/`merchantRequestId` on the
transaction) and the existing `markPaymentVerified`/`markPaymentFailed`
get called from the callback path below instead of sitting orphaned.

**The Daraja callback problem, and why it changes the design**:
`darajaGateway.initiateStkPush` always sends Safaricom to
`config.callbackUrl` — **one URL per business, registered with
Safaricom in advance**. A vending STK push cannot arrive at a
different URL than the existing checkout flow's callback, because
Safaricom was never told a second one exists, and registering one
means the business owner reconfiguring their live Daraja app — not a
code change. So the existing single route
(`app/api/webhooks/daraja/[businessId]/route.ts`) stays the one and
only Daraja webhook. It gains one branch, before its existing,
untouched call to `paymentService.processCallback`: parse the
callback once with `darajaGateway.verifyCallback` (a pure, side-effect-free
parser — safe to call regardless of which flow the callback belongs
to), look up `checkoutRequestId` in `machineTransactions`; if found,
handle it as a vending payment (idempotent via `webhookEventRepository`,
new `WebhookEventKind: 'vending_stk_callback'`) and return early. If
not found, fall through to the existing e-commerce path, completely
unchanged. This is additive to a route with 100% existing test
coverage, not a rewrite of it.

**Vend authorization stays synchronous with the callback for Phase 1**:
once a vending payment is verified, `authorizeVend` is called
immediately from the callback handler (as it already is from
`machineTransactionService.authorizeVend`), not queued through a
command system that doesn't exist yet. The machine (real or
simulated) polls a new status endpoint until it sees an authorization,
then dispenses and reports the result through the existing
`POST /api/vending/transactions`. This is deliberately request/response,
not push — MQTT/command delivery is NEXT-bucket, and a poll loop is a
completely adequate, already-idempotent-safe way to close the loop
without it.

**Transaction timeout**: reuse the exact pattern
`PaymentService.reconcileStuckIntents` already proves in production —
a cron sweep that finds transactions stuck in `paid`/`vend_authorized`
past a threshold and moves them to a new terminal `manual_review`
status, mirroring `PaymentIntentStatus.expired`. Not a new pattern;
the same one, applied to a second collection.

**Simulator**: a standalone script (`scripts/vendingSimulator/`),
not production code, that drives N simulated machines against the
real HTTP API using `MockVendingAdapter`'s own behavior as its model
of "what a real machine would do" — register, heartbeat, buy, fault,
go offline, come back, send duplicates. It calls the same routes a
real gateway would call; it proves the backend, not a mock of the
backend.

**Admin UI**: one list page, one detail page, under
`app/admin/(protected)/vending/`, following this codebase's existing
admin patterns (Server Component page + a client component for any
interactive bits), reading the existing GET routes/services directly
(Server Components can call services in-process; they don't need to
round-trip through the HTTP API the way a device does). No alerts, no
economics, no screen CMS — those need data or infrastructure that
doesn't exist yet.

## D. Database/schema changes

Two additive field changes to existing (empty-in-production) vending
types — no migration needed, since zero real vending documents exist:

- `MachineTransaction` gains `checkoutRequestId: string | null` and
  `merchantRequestId: string | null`, set once at STK-push time,
  read by the callback branch above. A new composite index
  (`businessId + checkoutRequestId`) for the lookup.
- `MachineTransactionStatus` gains `'manual_review'`, reachable from
  `paid` and `vend_authorized` (a timeout), terminal like `dispensed`/
  `refunded`.
- `WebhookEventKind` gains `'vending_stk_callback'`.

No other schema changes. Everything else in §0's EXISTING/KEEP rows
stays exactly as built.

## E. API changes

Three new routes, following the exact conventions
`docs/VENDING_FOUNDATION.md` §3 already established (device bearer
auth for device-facing routes, staff session + role for staff-facing
ones, `{ error: string }` on 4xx, no new framework):

- `POST /api/vending/payments` — device-authenticated. Body:
  `{ slotId, phoneNumber }`. Creates the pending transaction, calls
  `initiateMpesaPayment`, returns `{ transactionId, transactionRef,
  checkoutRequestId, customerMessage }`.
- `GET /api/vending/payments/[id]` — device-authenticated, scoped to
  the authenticated machine (a machine can only poll its own
  transactions). Returns `{ status, vendRef }` — what the machine
  polls while waiting for payment confirmation + vend authorization.
- No new route for the callback itself — see §C; it's a branch inside
  the existing Daraja webhook route.

No versioning scheme is introduced yet (nothing has shipped to a real
client that would need one); noted as a NEXT-bucket concern once a
second consumer of these routes exists.

## F. Device communication architecture

Stays HTTP request/response for Phase 1, deliberately. The benchmark's
MQTT capability is real and will matter once remote commands exist,
but there is no command to deliver yet, and building a `DeviceTransport`
abstraction with only an `HttpTransport` implementation and no second
implementation is speculative surface — the same mistake as adding
`connect()`/`restart()` to the hardware interface with no caller.
Phase 1's actual communication need — "did the payment succeed, is
the vend authorized" — is fully served by a poll loop against
`GET /api/vending/payments/[id]`, which is already idempotent-safe
infrastructure (bearer auth, no double-authorization risk) reused, not
new. `DeviceTransport`/MQTT is designed *for* in the sense that
nothing in Phase 1 hard-codes HTTP into a Service — every device
interaction already goes through a Service method, not a route
directly, so swapping the transport later touches routes, not
business logic.

## G. Security model

No changes to the existing model (`docs/VENDING_FOUNDATION.md` §4
still applies in full): hashed device credentials, `authenticateDevice`
scoped per-machine, `firestore.rules` denying all client writes and
scoping partner reads, `MACHINE_TRANSACTION_STATUS_TRANSITIONS`
enforced at the repository layer regardless of caller intent. The one
addition: the new payment-initiation route is device-authenticated
like every other device-facing route (a machine can only initiate a
payment as itself), and the STK callback branch inside the Daraja
webhook route inherits that route's existing origin verification
(`verifyDarajaWebhookRequest`) — no new trust boundary is created.

## H. Implementation phases

**NOW (this work, Phase 1)** — cross-referenced against §0, this is
what's actually missing for a first physical prototype, not the
brief's generic NOW list restated:
1. M-Pesa wiring for vending (§C/§D/§E) — the single highest-value gap.
2. Transaction timeout → `manual_review` (§D), reusing the proven
   `reconcileStuckIntents` sweep pattern.
3. Vending machine simulator (§C) — proves 1–2 end-to-end without
   hardware, and is the brief's own stated prerequisite to touching
   real hardware.
4. Minimal admin UI: machine list + detail page.
5. Tests for all of the above; full-suite regression; `tsc`/`eslint`/
   `next build`; Firestore index/rules verification.

**NEXT** (after Phase 1, before scale): remote commands + a real
transport (`DeviceTransport`, MQTT or otherwise), alert center, refund
reversal wiring, partner login/portal, restocking workflows beyond
auto-open, machine-level economics, observability metrics
(§20 of the brief).

**SCALE** (after validated deployment): screen CMS, promotions engine,
predictive restocking, dynamic pricing, location intelligence, OTA,
multi-manufacturer adapters beyond mock, fleet load testing at
100–10,000 simulated machines.

## I. Risks

- **Payment code is the highest-consequence code in this change.**
  Mitigated by reusing `PaymentGateway`/`darajaGateway` verbatim rather
  than writing new Daraja integration code, and by branching inside
  the existing, fully-tested webhook route rather than adding a
  parallel path.
- **The single shared Daraja callback URL is a real constraint**, not
  a design preference — get the branch-and-fallthrough wrong and
  either vending payments silently never resolve, or worse, an
  e-commerce checkout callback gets misrouted into the vending branch.
  Mitigated by keying the branch on an exact `checkoutRequestId` match
  in `machineTransactions` (a value only vending's own `initiateMpesaPayment`
  ever writes) before touching anything, and falling through to the
  unmodified existing path on no match.
- **No physical machine or manufacturer SDK exists to validate against.**
  The simulator proves the *backend's* correctness under realistic
  message patterns (duplicates, offline periods, out-of-order
  delivery); it cannot prove a real Shengma/other adapter will behave
  the same way. This is stated as a limit, not glossed over.
- **Zero real vending transaction volume** means the timeout/
  manual_review threshold is a guess until real data exists — chosen
  conservatively and revisited once real machines report.

## J. Test strategy

Extends the existing 189-vending-test baseline; no existing test is
modified except where a shared file (the Daraja webhook route, its
existing test file) gains new cases.

- `machineTransactionService`: STK push initiated on
  `initiateMpesaPayment`, checkout-request persisted, payment
  succeeded → verified → auto-authorize → `vend_authorized`; payment
  failed → `payment_failed`, no authorization attempted; duplicate
  callback delivery → idempotent, no double-authorization; timeout
  sweep moves a stuck `paid`/`vend_authorized` transaction to
  `manual_review` and leaves a fresh one alone.
- Daraja webhook route: a vending `checkoutRequestId` is routed to the
  vending path and never reaches `paymentService.processCallback`; a
  non-vending `checkoutRequestId` reaches `paymentService.processCallback`
  exactly as it does today (regression proof); every existing test in
  that route's test file still passes unmodified.
- New payment routes: device auth required; a machine cannot poll or
  pay on behalf of another machine; input validation on phone number/
  slot; error-to-status mapping for insufficient stock, disabled slot,
  machine not found.
- Simulator: a smoke test that runs it against the real emulator-backed
  services for a small N and asserts the expected transaction/telemetry
  counts land correctly — proof the simulator itself is wired
  correctly, not a substitute for the service-level tests above.
- Admin UI: route-level tests for the pages' data-fetching, matching
  the existing admin-page test conventions in this codebase.
- Full regression: `npm test`, `tsc --noEmit`, `eslint .`, `next build`,
  and a check that every new/changed query has a matching
  `firestore.indexes.json` entry before merge.

## Phase 1 — implemented

Everything in §H's NOW list is built, tested, and green. What actually
shipped, against the plan above:

**Payments.** `MachineTransaction` gained `checkoutRequestId`/
`merchantRequestId` and a `manual_review` terminal status (reachable
from `pending`, `paid`, and `vend_authorized`, and itself able to
resolve into `dispensed`/`paid_vend_failed`/`refund_requested` if a
late device report or human decision arrives).
`machineTransactionService` gained `initiateMpesaPayment` (constructor-
injects `PaymentGateway`, defaulting to the real `darajaGateway` — no
new payment abstraction, as planned) and `handleMpesaCallback`, which
owns the *only* path that can move a transaction to `paid`. The
existing Daraja webhook route (`app/api/webhooks/daraja/[businessId]/route.ts`)
gained exactly one branch, checked first: a `checkoutRequestId` match
against `machineTransactions` is claimed by `handleMpesaCallback` and
returns before the unmodified e-commerce path ever runs; a payload
that doesn't parse as an STK callback at all, or doesn't match any
vending transaction, falls through to that unmodified path — proven
by a regression test that the existing behaviour is byte-for-byte
unchanged. A genuine failure inside `handleMpesaCallback` (not "this
isn't ours," an actual thrown error) is deliberately **not** swallowed
into that fallthrough — it propagates, so Safaricom retries a real
failure instead of the callback being silently misrouted.

**New routes**: `POST /api/vending/payments` (device-authenticated,
initiates the STK push for a slot) and `GET /api/vending/payments/[id]`
(device-authenticated, scoped to the caller's own machine — the poll
loop a machine runs while waiting for authorization).

**Transaction timeout.** `machineTransactionService.reconcileStuckTransactions`
mirrors `PaymentService.reconcileStuckIntents`'s own proven pattern: a
`paid`/`vend_authorized` transaction untouched past a threshold (15
minutes, chosen conservatively ahead of any real volume) moves to
`manual_review`. A new cron, `reconcile-vending-transactions`, runs it
daily — daily because every other cron in `vercel.json` is, not
because that cadence is ideal; tightening it is a NEXT-bucket item
once real machines make "how long is a genuine reconnect" an
answerable question instead of a guess.

**Simulator.** `scripts/vendingSimulator/` — `SimulatedMachine`
(heartbeat, duplicate telemetry, out-of-order telemetry, faults,
offline/reconnect, and the full buy → poll → report flow, split into
`initiatePurchase`/`waitForAuthorizationAndReport` so a caller can
inject a real or simulated Safaricom callback deterministically
between the two) driven through `InProcessRouteCaller`, which calls
the *real* Route Handler functions — the same technique this
codebase's own route tests already use, so the simulator exercises
the identical auth/validation/service/Firestore path a real HTTP
request would. Proven by `tests/scripts/vendingSimulator.test.ts`,
which runs it against the real emulator-backed services for a small
fleet and asserts on real Firestore state — this is what "prove the
backend now, automatically" meant in practice, rather than an
unverified manual CLI run. A genuine `fetch`-based transport for
load-testing 100s–1,000s of machines against a live deployment is
designed for (the `RouteCaller` interface is transport-agnostic) but
not built — it needs a standalone TypeScript-execution story this
repo doesn't have yet (no `tsx`/`ts-node`), and adding one is its own
decision, not a side effect of building the simulator.

**Admin UI.** `/admin/vending` (fleet list: status/connectivity
counts, machine table) and `/admin/vending/[machineId]` (one machine's
slots, recent transactions, recent telemetry) — a new `vending`
`AdminSection`/nav group/i18n entries, gated the same way every other
admin area is (`requireAdminSection`). Deliberately not the "fleet
operations center" sketched in §26 of the original brief: alerts,
machine-level economics, and location intelligence all need
capabilities (§0) that don't exist yet, and mocking up a dashboard
for data nothing behind it produces would be exactly the kind of
premature building §31 warns against.

**Measured**: 240 test files, 2,646 tests, all green (up from 236/2,612
before this phase — 4 new files, 34 new tests, zero regressions).
`tsc --noEmit` clean. `eslint .` clean except the same 2 pre-existing
warnings from before any of this vending work. `next build` succeeds,
every new route and page registered with no conflicts. One index gap
was found and closed during this pass:
`machineTelemetryEventRepository.listByMachine` called without an
`eventType` filter (the admin detail page's own call) needs
`businessId+machineId+receivedAt`, a different shape than the
`businessId+machineId+eventType+receivedAt` index the original
foundation added — added to `firestore.indexes.json`.

**Still NEXT/SCALE, unchanged from §H**: MQTT/`DeviceTransport`,
remote commands, alert center, refund reversal wiring, partner
login/portal, restocking workflows beyond auto-open, machine-level
economics, location intelligence, screen CMS, promotions, predictive
restocking, dynamic pricing, and fleet load testing at real scale.
