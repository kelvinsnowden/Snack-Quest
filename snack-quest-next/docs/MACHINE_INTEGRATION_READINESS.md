# Machine Integration Layer — Pre-Production Readiness

Status document for the hardening pass that has to finish before the
Machine API specification goes to a real manufacturer. §1–§4 are the
audit, written **before** any hardening code changed. §5 onward track
what was done and what is still open.

Companion documents: `MACHINE_INTEGRATION_LAYER.md` (architecture),
`SNACK_QUEST_MACHINE_API_V1.md` (the external contract).

---

## 1. Method

- Read the code, not the earlier summaries. That covers every route
  under `app/api/v1` and `app/api/vending`, the services and
  repositories behind them, Firestore rules and indexes, the crons,
  `proxy.ts`, and the docs and OpenAPI file.
- Worked through each failure path by hand: what state is written, in
  what order, and what happens if the process dies between two writes.
- Estimated scale from the Firestore operations each endpoint actually
  performs.

## 2. Audit findings

Severity:
- **S1:** can lose or double-count money or stock, or let one party act
  as another.
- **S2:** breaks at scale, or leaves an operator blind during an
  incident.
- **S3:** friction, drift or hygiene.

| ID | Sev | Area | Finding | Root cause |
|---|---|---|---|---|
| A-01 | S1 | Money / inventory | `machineTransactionRepository.moveStatus` is read-then-update without a Firestore transaction. Two concurrent outcome reports for one vend (push + pull reconciliation, or a retry with a regenerated event id) can both pass the transition check and both apply. That means a double stock decrement, or both "dispensed" and "failed" being applied | No compare-and-set on the money-side state machine |
| A-02 | S1 | Inventory | `applyVendReport` claims its idempotency record *before* doing the work and treats any existing claim as "already applied". A crash between claim and completion leaves the sale without its stock movement forever; the retry is silently dropped | Claim-before-act used as "done" marker; no processed check on retry |
| A-03 | S1 | Money | A late `dispensed` after the refund decision (`paid_vend_failed`/`refund_requested`/`refunded`) returns a bare 409. The physical truth (product left the machine) is discarded: no stock movement, no operator signal, and the customer may have both the snack and the refund | Transaction state machine has no conflict path |
| A-04 | S1 | Money | The same `eventId` reused with a *different* payload (e.g. `failed` then `dispensed`) is treated as a duplicate and silently ignored | Idempotency key without a request fingerprint |
| A-05 | S1 | Settlement | `distributableOwnerKes = grossSalesKes − refundsKes − …`, but `grossSalesKes` counts only `dispensed` transactions and refunded transactions are always failed vends that were never in gross. Every refunded failed vend is deducted from the owner **again** | Refunds netted against a gross that never contained them |
| A-06 | S1 | Settlement | Revenue is attributed by transaction `createdAt`. A sale resolved from `manual_review` after its period was settled is never counted in any settlement | Wrong attribution timestamp; no late-resolution reconciliation |
| A-07 | S1 | Security | `recordUse` writes the credential document on **every** request. One fleet key means one hot document: at ~1,000 machines that's ~120 writes/s to a single doc, which exceeds Firestore's sustained per-document rate. The failure propagates as a 500 on the request itself | Unthrottled bookkeeping on the auth path |
| A-08 | S1 | Security | Device-bearer auth on `/api/v1` carries the internal Firestore `machineId`. It has no replay protection, and the spec described its format incorrectly (§3.6 said `{deviceCredentialId}`) | Legacy per-machine scheme reused in the external API |
| A-09 | S2 | Abuse | No rate limiting anywhere on `/api/v1`. Every unauthenticated request with a well-formed key id costs a Firestore read. Every signed request costs a nonce write, regardless of volume | Not built |
| A-10 | S2 | Signing | Server hashes `request.text()` (a UTF-8 *decoded then re-encoded* string), not the raw bytes. BOM / invalid-UTF-8 bodies can't be verified the way the spec says. JSON is parsed before authentication, so malformed-JSON floods skip auth | Body handling order |
| A-11 | S2 | Signing | Uppercase hex signatures are rejected; only one TS test vector exists, and nothing proves another language signs identically | Under-specified canonical form |
| A-12 | S2 | Credentials | No rotation primitive (overlap is "issue another and remember to revoke"), no status model, no first-use tracking, no machine scoping. `secretPrefix` stores 4 real characters of the secret | Lifecycle not modelled |
| A-13 | S2 | Observability | No structured logging in the vending layer at all. Unexpected errors escape the v1 envelope as a bare 500 with no request id. Nothing correlates payment → transaction → command → machine report | Not built |
| A-14 | S2 | Recovery | Every recovery sweep runs on a **daily** cron (Vercel Hobby limit), yet each of these is provably safe to resolve within minutes: an expired, uncollected queued command; a claimed-but-never-sent command; a paid transaction whose dispatch never started. Customers wait up to 24 h for the refund path | No fast-recovery tier; no opportunistic triggers |
| A-15 | S2 | Liveness | The inbound adapter accepts orders for a machine silent for up to 15 minutes, but queued commands expire after 2. The customer pays, the machine can't collect, and the money waits for the daily sweep. Health states are timestamp heuristics with no expected-interval, grace, maintenance or "haven't heard yet" distinction | Liveness not modelled |
| A-16 | S2 | Monitoring | Alerts are only evaluated when someone opens an admin or owner page (`alertService.evaluateAndSync`). Each page view scans up to 7 days of events and 180 days of movements across the fleet. No operator is ever *notified* | Pull-only alerting on the request path |
| A-17 | S2 | Scale | Every heartbeat and every status report is stored as a `machineEvents` document. A persistent fault is re-emitted on every status report. ~6 Firestore writes per heartbeat | Events used for liveness samples, not state changes |
| A-18 | S2 | Scale | An idle command poll does ~5 reads + 3 writes: credential, integration, machine, two command queries; nonce, credential use, signal | No caching, no "nothing queued" hint |
| A-19 | S2 | Ordering | An older status snapshot arriving after a newer one overwrites `lastReportedStatus`. A stale `dispensing` after `dispensed` returns 409 rather than a harmless no-op | Last-writer-wins on device time-less data |
| A-20 | S2 | Inbound recovery | For an inbound machine with an `unknown`/`timeout` dispense there is no channel to ask the machine what happened; only a spontaneous late report can resolve it | Poll-only protocol has no reconcile request |
| A-21 | S2 | Camera | `getCameraStreamInfoForOwner` returns the camera's raw host, port and stream path to machine owners, which is enough to bypass Snack Quest's access control and try the camera directly | No brokered/signed viewing contract |
| A-22 | S3 | Operations | The Daraja callback dispatches each cart item's vend synchronously inside Safaricom's callback request. A slow manufacturer API can push the callback past its deadline; a killed function leaves items `paid` with no dispatch (see A-14) | Physical side effects on the payment webhook's critical path |
| A-23 | S3 | Manufacturer change | Re-configuring a machine to a new manufacturer leaves the old identity claim and any queued commands behind | Not handled |
| A-24 | S3 | Firmware | Firmware changes are recorded silently; nothing flags a machine running firmware its model wasn't certified on | Not tracked |
| A-25 | S3 | Contract | The docs, OpenAPI file, simulator and implementation are hand-kept in sync; nothing fails when they drift. No reference client exists in any language | No contract tests / SDK |
| A-26 | S3 | Certification | Certification is a manual checklist; no automated harness exercises a manufacturer's client against scripted conditions | Not built |
| A-27 | S3 | Cron auth | `CRON_SECRET` compared with `!==` (not constant-time) | Minor |

Verified sound (kept as is):
- **Dispense claims:** the command is claimed with `create()` before any
  hardware is contacted, and the paid-status check comes before the
  claim.
- **Nonces:** claimed only after the signature verifies.
- **Tenant and manufacturer isolation** on every `/api/v1` lookup.
- **Firestore rules** for the new collections.
- **Admin routes:** role-guarded and audit-logged.
- **Webhook ingestion:** idempotent per delivery.
- **Environments:** the sandbox/production split is enforced in three
  places.

## 3. Readiness matrix (before)

Legend: ✅ adequate · 🟡 partial · ❌ missing.

| Area | Item | Before |
|---|---|---|
| Security | Authentication (HMAC) | 🟡 (A-10, A-11) |
| | Authorization / tenant + manufacturer isolation | ✅ |
| | Owner isolation | ✅ (camera exception A-21) |
| | Credential storage / encryption | ✅ |
| | Key rotation / lifecycle | ❌ (A-12) |
| | Replay protection | ✅ |
| | Rate limiting / abuse protection | ❌ (A-09) |
| | Audit logging (admin) | ✅ |
| | Log redaction | ❌ (no logging to redact; A-13) |
| | Client bundle exposure | ✅ |
| Reliability | Idempotency | 🟡 (A-02, A-04) |
| | Concurrency safety | ❌ (A-01) |
| | Unknown / late outcomes | 🟡 (A-03, A-20) |
| | Fast recovery | ❌ (A-14) |
| | Liveness model | ❌ (A-15) |
| Financial | Payment ≠ dispense | ✅ |
| | Refund / conflict handling | ❌ (A-03) |
| | Settlement correctness | ❌ (A-05, A-06) |
| Inventory | Ledger integrity under failure | ❌ (A-01, A-02) |
| | Machine-vs-ledger comparison | ✅ |
| API design | Versioning / tolerant readers | ✅ |
| | Error contract | 🟡 (A-13) |
| | Rate limits, request ids | ❌ |
| | Contract tests / SDKs | ❌ (A-25) |
| Operations | Alerting | ❌ (A-16) |
| | Tracing a customer complaint | ❌ (A-13) |
| | Certification | 🟡 manual only (A-26) |
| Scale | 1,000 machines | ❌ (A-07, A-17, A-18) |

## 4. Scale model (before)

Assumptions:
- An inbound machine polls commands every 10 s and heartbeats every
  60 s.
- It sends a status report on change, or at least every 5 minutes.
- Firestore list prices: $0.06 per 100k reads, $0.18 per 100k writes.

| | Reads / day / machine | Writes / day / machine | ≈ $ / month / machine |
|---|---|---|---|
| Before | ~47,500 | ~34,500 | ~2.70 |

| Machines | Requests / s | What happens (before) |
|---|---|---|
| 5 | ~0.6 | Fine |
| 100 | ~12 | Credential doc at ~12 writes/s: latency and contention begin |
| 1,000 | ~120 | Shared-key `lastUsedAt` contention causes request failures (A-07). Every admin or owner page view scans millions of heartbeat events (A-16, A-17). ~$2.7k/month on Firestore |
| 10,000 | ~1,200 | Everything above ×10. The `machineEvents` sequential-index write rate nears Firestore's hot-spot threshold. ~$27k/month |

---

---

## 5. What changed (issue → fix → evidence)

Every audit finding, with where it was fixed and the test that holds it
in place. "Partial" means the risk is reduced, not gone — the gap is
stated.

| ID | Status | Fix | Evidence (tests) |
|---|---|---|---|
| A-01 | Fixed | `moveStatus` is a compare-and-set transaction (`expectedFrom`); outcome decisions re-decide on a lost race, so two contradicting reports end "one applied, one conflict" | `vendOutcomeSafety`, `vendOutcomeDecision` |
| A-02 | Fixed | Report claims carry a fingerprint and a `processed` flag; a crashed claim is resumed; the sale movement is keyed `sale:{txId}` and self-heals | `vendOutcomeSafety` (crash-resume), `deepReconciliation` |
| A-03 | Fixed | Late contradicting outcome → `outcomeConflict` on the sale, `DISPENSE_OUTCOME_CONFLICT` event, critical `dispense_conflict` alert; stock recorded if the product left; money untouched | `vendOutcomeSafety`, horrible-day D |
| A-04 | Fixed | Same id + different content → `409 idempotency_key_reused` (reports) / `conflictingEventIds` (events) | `machineApiHardening`, horrible-day Q |
| A-05 | Fixed | Refunds of never-dispensed sales are no longer deducted from gross that never contained them; reported separately as `failedVendRefundsKes` | `partnerAndSettlementService` |
| A-06 | Fixed | Gross attributed by `dispensedAt` — a sale resolved from review lands in the period it resolved | `partnerAndSettlementService` |
| A-07 | Fixed | `lastUsedAt` throttled to once a minute per key; credentials cached 30 s (negative cache too) | `integrationHardeningUnits`, `machineRequestCost` |
| A-08 | Fixed | Device-bearer auth removed from `/api/v1` (`401 missing_signature`); machine-scoped signed keys instead | `machineApiV1`, horrible-day M |
| A-09 | Fixed | Rate limits per machine × endpoint, per key, per IP (auth failures), per machine (4xx) — after signature verification; KV-backed when configured | `machineApiHardening`, horrible-day N, O |
| A-10 | Fixed | Raw bytes hashed; UTF-8 decoded (fatal) and JSON parsed only after authentication | `machineApiHardening` |
| A-11 | Fixed | Uppercase hex accepted; 7 official vectors; reproduced by TypeScript and Python clients | `referenceSdks`, `integrationHardeningUnits` |
| A-12 | Fixed | Lifecycle issued → active → rotating (grace, signalled by headers) → expired / revoked; machine scope; fingerprint instead of secret prefix | `machineApiHardening`, horrible-day H |
| A-13 | Fixed | Structured, redacting logger; every response has `SQ-Request-Id`; unexpected errors are enveloped (`internal_error` / `temporarily_unavailable`); sale trace | `machineApiHardening`, `saleTrace` |
| A-14 | Fixed | Three-tier recovery: fast (customer poll, machine poll, 5-minute cron), periodic pull with backoff, daily deep reconciliation | `dispenseRecovery`, `deepReconciliation`, horrible-day A, B, T |
| A-15 | Fixed | Liveness model ONLINE / DEGRADED / OFFLINE / UNKNOWN with expected interval, grace and maintenance; orders need ONLINE and contact within 90 s | `machineLiveness`, `dispenseRecovery` |
| A-16 | Fixed | Alert sweep runs at most once a minute from pages and every 5 minutes on schedule; critical alerts are texted (burst → one digest) | `alertService`, `cronVendingFastRecoveryRoute` |
| A-17 | Fixed | Heartbeats write signals, not events; status emits change-only events | `machineApiV1`, `machineRequestCost` |
| A-18 | Fixed | Idle polls skip command queries (queue marker written before any command exists) | `machineRequestCost` (3 reads, 1 write) |
| A-19 | Fixed | Older status snapshots never overwrite newer; stale progress is a harmless no-op | horrible-day D, `sandboxFaults` |
| A-20 | Fixed | Heartbeat responses carry `reportOutcomes` for dispenses awaiting an outcome | `dispenseRecovery`, horrible-day B |
| A-21 | Fixed | Owners get a live-view capability, never host/port/path/credentials | `ownerPortalService` |
| A-22 | Partial | Paid-but-undispatched sales are recovered within minutes (fast tier). Dispatch still runs inside the Daraja callback | `dispenseRecovery` |
| A-23 | Fixed | Re-pointing a machine resets its signals and is refused while a dispense is in flight; old manufacturer's key is locked out | `manufacturerReplacement` |
| A-24 | Fixed | Firmware change → `FIRMWARE_CHANGED` event, alert, flagged when the model was certified before | horrible-day R |
| A-25 | Fixed | Contract test ties routes, schemas, OpenAPI, spec, error catalogue and SDKs together; reference SDKs exist | `machineApiContract`, `referenceSdks` |
| A-26 | Fixed | Automated certification harness, self-tested against good and broken machines | `certificationHarness` |
| A-27 | Fixed | Constant-time cron secret comparison on every cron route | cron route tests |

Found during this pass (not in the original audit) and fixed:

| Issue | Fix | Evidence |
|---|---|---|
| A dispense Snack Quest never ordered was logged as an info-level unknown event | `DISPENSE_UNRECOGNISED` + inventory alert | horrible-day J |
| A machine with a drifted clock went silent with no way to recover itself | `stale_timestamp` returns `serverTimestamp`; SDKs correct their offset | horrible-day P, `referenceSdks` |
| A manufacturer adding a failure code would have its outcome reports (and refunds) refused | `failureCode` is tolerant; contradictory codes still refused | horrible-day S, `machineApiV1Schemas` |
| Outbound API outage charged customers only to refund them | Two-minute per-machine breaker on the pre-payment gate | horrible-day G |
| A manufacturer-wide outage produced N unrelated offline alerts | One critical `manufacturer_outage` alert, auto-resolving | horrible-day T |
| Status reports kept the heartbeat signal fresh, hiding a machine that never heartbeats | Only heartbeats move the heartbeat signal | `certificationHarness` |
| Idle polls on a machine that had never had a command ran full queries | "Never queued" counts as idle | `machineRequestCost` |
| Nonce documents were never deleted (≈10 M/day at 1,000 machines) | TTL + index exemption declared in `firestore.indexes.json` | — (deployed config) |
| Customer paid → complaint had no single place to look | Sale trace service, API and admin page | `saleTrace`, `vendingTraceRoute` |

## 6. The horrible day (scenarios A–T)

Evidence: `tests/integration/horribleDay.test.ts` (34 tests, all driven
through the real routes and services). ✅ yes · ⚠️ with a condition ·
❌ no.

| | Scenario | What happens | Money safe | Double dispense possible | Inventory corrupted | Recovers by itself | Operator alerted |
|---|---|---|---|---|---|---|---|
| A | Paid, then machine disconnects | A silent machine is refused *before* payment. If it drops after: the queued command expires (2 min) → refund; a late ack is refused | ✅ | ❌ | ❌ | ✅ | ✅ `machine_offline` (critical, SMS) |
| B | Dispensed, connection dies before confirmation | Retried report (same `eventId`) → `duplicate`. No report at all → after 5 min: timeout + human review, never an automatic refund; the machine is asked again in each heartbeat | ✅ | ❌ | ❌ (one movement, when the truth arrives) | ⚠️ when the machine reports; otherwise a human | ✅ review queue |
| C | Same webhook 100× | Applied once; 99 acknowledged as duplicates | ✅ | ❌ | ❌ | ✅ | n/a |
| D | Events out of order | Late `dispensing` after `dispensed` is a no-op; older status never overwrites newer; contradicting outcome → conflict, money unchanged | ✅ | ❌ | ❌ | ✅ | ✅ `dispense_conflict` for contradictions |
| E | Heartbeat after "offline" | ONLINE again; `MACHINE_ONLINE` recorded once; the offline alert closes itself | ✅ | ❌ | ❌ | ✅ | ✅ (and cleared) |
| F | Two servers, same dispense | Transactional claim: one command, the machine told once | ✅ | ❌ | ❌ | ✅ | n/a |
| G | Manufacturer API down 30 min | Connection refused → provably unsent → refund; breaker stops new payments for 2 min per machine. Timeout mid-call → review, pulled on backoff until the API returns | ✅ | ❌ | ❌ | ✅ (pull) | ⚠️ via the review queue — no dedicated "outbound API down" alert |
| H | Key revoked mid-flight | In-flight requests finish or are refused cleanly; everything after is `401 key_revoked` within 30 s everywhere; rotation keeps the fleet online | ✅ | ❌ | ❌ | n/a | n/a |
| I | Inventory contradicts Snack Quest | Reported, never trusted; ledger unchanged | ✅ | ❌ | ❌ | ⚠️ a human adjusts (audited flow) | ✅ `inventory_discrepancy` |
| J | Dispense Snack Quest doesn't recognise | Nothing moves; recorded as `DISPENSE_UNRECOGNISED` | ✅ | ❌ | ❌ | ⚠️ a human checks slot and camera | ✅ `inventory_discrepancy` |
| K | Payment callback twice | Deduplicated by checkout id and status guard; one command | ✅ | ❌ | ❌ | ✅ | n/a |
| L | Sandbox key against production | `403 environment_mismatch` before anything is read or written | ✅ | ❌ | ❌ | n/a | ⚠️ counted, not alerted |
| M | Credentials compromised | Blast radius: that manufacturer's machines in that environment (one machine with a scoped key). Cannot create sales or commands. **Can** report false outcomes for genuine in-flight dispenses | ⚠️ see note | ❌ | ⚠️ via false outcomes | ✅ after revocation | ❌ no anomaly detection on key use |
| N | 100× traffic from one machine | Throttled per endpoint; its dispense reporting and every other machine unaffected | ✅ | ❌ | ❌ | ✅ | ⚠️ `SQ-RateLimit` headers + logs; no alert |
| O | Malformed JSON continuously | 400 until the machine's 4xx budget (60/min) runs out, then 429; others unaffected | ✅ | ❌ | ❌ | ✅ | ⚠️ logs only |
| P | Clock 20 minutes off | Refused with the server's time; clients correct and succeed; event times within 24 h are kept as sent | ✅ | ❌ | ❌ | ✅ (with the SDKs) | ⚠️ auth-failure count on the integration |
| Q | Same event id, different payload | First stands; events listed as conflicting; outcome reports `409` | ✅ | ❌ | ❌ | ✅ | ⚠️ response only |
| R | Firmware change | Recorded; flagged if the model was certified on older firmware; machine keeps working | ✅ | ❌ | ❌ | n/a | ✅ `integration_issue` |
| S | Manufacturer changes a field | Unknown fields ignored; unknown event types kept; missing required field → precise 422; new failure codes accepted as `failed` | ✅ | ❌ | ❌ | ✅ | ⚠️ `unknownTypes` in responses |
| T | Manufacturer disappears | One critical `manufacturer_outage` alert (inbound fleets of 3+), orders refused, queued dispenses refunded, acknowledged ones reviewed; clears on return | ✅ | ❌ | ❌ | ✅ | ✅ (inbound) / ⚠️ per-machine for outbound |

**Note on M.** A stolen key can report `failed` for a dispense that
actually dropped (the customer is refunded *and* keeps the product) or
`dispensed` for one that didn't (the customer isn't refunded). Both
require a genuine in-flight command and are bounded to that
manufacturer's live dispenses; both show up in reconciliation and the
camera evidence. Revocation is the remedy. There is no automatic
anomaly detection (new source IP, unusual outcome mix) — a stated gap.

## 7. Scale (after)

Measured, not estimated: `tests/perf/machineRequestCost.test.ts` counts
Firestore operations per request in steady state and fails the build
if the hot path gets more expensive.

| Request | Reads | Writes | Before |
|---|---|---|---|
| Idle command poll | 3 | 1 (nonce) | ~5 R + 3 W |
| Heartbeat | 4 | 1 (nonce) + throttled signal writes | ~6 W |
| A complete sale (verify → dispatch → poll → ack → dispensed) | ~51 | ~20 | — |

Per inbound machine per day (poll every 10 s, heartbeat every 60 s,
status every 5 min; signal writes at their 30–60 s throttles):
**≈ 33,000 reads and ≈ 16,000 writes → ≈ $1.50 / month** at Firestore
list prices (before: ≈ $2.70). With `MACHINE_API_NONCE_STORE=kv` the
nonce writes (≈ 10,000/day) move to KV.

| Machines | Requests/s (steady) | Firestore / month | What happens |
|---|---|---|---|
| 5 | 0.6 | ≈ $8 | Fine. **But Vercel Hobby's invocation allowance does not cover even this** — 5 machines ≈ 1.5 M invocations/month |
| 100 | 12 | ≈ $150 | Fine technically. Needs a paid Vercel plan. KV (if used for rate limits and nonces) costs more than Firestore at pay-as-you-go prices — pick a fixed plan |
| 1,000 | 120 | ≈ $1,500 | **What breaks first — see below.** Firestore itself is comfortable (~40 writes/s, random document ids) |
| 10,000 | 1,200 | ≈ $15,000 | The 5-minute alert sweep reads every machine and slot (~300 k reads a run) — too slow and too costly; must become incremental. Polling is the dominant cost; move to long-poll or push |
| 100,000 | 12,000 | ≈ $150,000 | Not viable with 10-second HTTP polling on serverless functions. Needs a persistent push channel (the `CloudTransport` MQTT abstraction exists but is not deployed), regional sharding, and a different rate-limit/nonce store |

**What breaks first at 1,000 machines, in order:**
1. **Cost of polling, not correctness.** 120 requests/s, ~310 M
   function invocations a month. Every request is a signature check, a
   nonce write and rate-limit calls. The lever needs no firmware change:
   `nextPollSeconds` is server-controlled (10 s idle, 2 s while a
   customer pays). Raising idle to 20–30 s halves or thirds the bill at
   the cost of a few seconds' latency on the first poll after payment.
2. **The alert sweep's full scans** every 5 minutes (~31 k reads a run,
   ~$160/month, growing linearly). Fine at 1,000; must be incremental
   before 10,000.
3. **Per-instance limits without KV.** If KV isn't configured, rate
   limits and the credential cache are per server instance — a flood
   spread over many instances isn't limited globally.

Nothing in the money or dispense paths depends on fleet size: every
money-moving write is a per-sale transaction.

## 8. Manufacturer onboarding

1. **Application and technical review** — manufacturer record, models,
   capabilities (admin console).
2. **Sandbox credentials** — `sqk_test_` keys, shown once; optionally
   machine-scoped.
3. **Build** — against `SNACK_QUEST_MACHINE_API_V1.md`, the OpenAPI
   file, the signing vectors and a reference client (TypeScript or
   Python). Snack Quest's simulator shows what a correct machine sends.
4. **Sandbox machines** — staff register units; the manufacturer's
   firmware connects and runs.
5. **Certification** — the harness runs against the manufacturer's
   machine on a bench (`integrationCertificationService.run(…, { recordToModel: true })`),
   writes evidence into the model's checklist, and a person verifies what
   the harness can't (physical drop confirmation on every slot type,
   power loss mid-vend, 24-hour heartbeat soak, secret storage) and
   certifies the model.
6. **Production** — manufacturer moved to `production` (needs a
   certified model), production keys issued, machines activated
   (activation blockers enforce certification and environment).

## 9. Readiness matrix (after)

| Area | Item | Before | After |
|---|---|---|---|
| Security | Authentication (HMAC) | 🟡 | ✅ |
| | Authorization / isolation | ✅ | ✅ (+ machine scope, `environment_mismatch`) |
| | Owner isolation | ✅ (camera gap) | ✅ |
| | Key rotation / lifecycle | ❌ | ✅ |
| | Rate limiting / abuse | ❌ | ✅ (⚠️ per-instance without KV) |
| | Log redaction | ❌ | ✅ |
| | Anomaly detection on key use | ❌ | ❌ |
| Reliability | Idempotency | 🟡 | ✅ |
| | Concurrency safety | ❌ | ✅ |
| | Unknown / late outcomes | 🟡 | ✅ |
| | Fast recovery | ❌ | ✅ (⚠️ 5-min cadence needs the GitHub workflow) |
| | Liveness model | ❌ | ✅ |
| Financial | Payment ≠ dispense | ✅ | ✅ |
| | Refund / conflict handling | ❌ | ✅ decision side · ❌ refund *execution* is manual |
| | Settlement correctness | ❌ | ✅ for defined rules · undefined rules isolated (§10) |
| Inventory | Ledger integrity under failure | ❌ | ✅ (+ daily deep reconciliation) |
| API | Tolerant readers / evolution rules | ✅ | ✅ (documented per change type) |
| | Error contract / request ids / rate-limit headers | ❌ | ✅ |
| | Contract tests / SDKs | ❌ | ✅ |
| Operations | Alerting | ❌ | ✅ (SMS for critical) |
| | Tracing a complaint | ❌ | ✅ |
| | Certification | 🟡 | ✅ automated + human sign-off |
| Scale | 1,000 machines | ❌ | ✅ technically · ⚠️ cost of polling (§7) |

## 10. Owner settlement: defined and undefined rules

The chain: customer pays → transaction (money state) → dispense
command (physical state) → revenue attribution → settlement. Physical
state can't create revenue twice: gross counts transactions in status
`dispensed` by `dispensedAt`, and a transaction reaches `dispensed` at
most once (compare-and-set).

| Case | Rule | Where |
|---|---|---|
| Dispensed sale | In gross, in the period it was dispensed | `computeGrossForPeriod` |
| Failed dispense, refunded | Never in gross; not deducted; reported as `failedVendRefundsKes` for visibility | same |
| Unknown outcome (review) | Not in gross until resolved; lands in the period it resolves | same |
| Outcome conflict (product left, money refunded) | Counted (`outcomeConflictCount`), **not** deducted — **who bears this loss is undefined** | same |
| Partial refunds | Not possible: one item per transaction (a cart is N transactions) | — |
| Chargebacks / reversal of a dispensed sale | **Undefined business rule.** Isolated in `revenueReversalsForPeriod()`, which returns 0 today | `machineSettlementService` |

Decisions the business must make before the first owner payout on real
machines: who bears conflicts and chargebacks (owner, Snack Quest, or
split); whether a settled period is reopened for a late reversal or the
reversal lands in the next period.

## 11. Camera contract

Owners and customers never receive a camera address or credential.
The owner endpoint returns a capability:
`{ mode: 'unavailable', cameraOnline, reason }` today, and
`{ mode: 'relay_url', url, expiresAt }` once a streaming relay exists
— a short-lived, per-viewer URL. Snapshots go through Snack Quest's
storage. Staff diagnostics keep the raw stream info. Not built: the
relay, recording and retention, and privacy notices at the machine.

## 12. Deploying and rolling back

**Before the first deploy with this change set**
1. Set `SECRET_ENCRYPTION_KEY` (64 hex) and `CRON_SECRET`.
2. Configure KV (`UPSTASH_REDIS_REST_URL`/`_TOKEN`) for global rate
   limits — optional but recommended beyond a handful of machines.
3. `firebase deploy --only firestore:indexes,firestore:rules` — new
   composite indexes, the nonce TTL, and the credential rules.
4. Seed templates: `node scripts/seedNotificationTemplates.mjs`
   (adds `vending_critical_alert_sms`).
5. Add repository secrets `CRON_SECRET` and `SNACK_QUEST_BASE_URL` so
   `.github/workflows/vending-fast-recovery.yml` runs every 5 minutes.
6. Deploy when no dispense is in flight (true before launch): commands
   queued by older code have no queue marker and would only be found by
   the recovery sweep (refunded), not by the machine's poll.

**After deploying:** run the certification harness against the
simulator in staging (it must say CERTIFIED), check
`/admin/vending/alerts` and one sale trace.

**Rolling back:** redeploy the previous build. Data written by this
version is additive (new optional fields and collections), so the
previous build reads it. Rolling back re-opens device-bearer auth on
`/api/v1` (no client uses it) and drops rate limiting and the fast
recovery tier; a key rotated under this version still stops at the
end of its grace window, because rotation also writes it as the key's
expiry, which the previous build enforces.

## 13. READY TO HAND TO A MANUFACTURER — checklist

Ticked only where there is evidence, not merely code.

| ✓ | Item | Evidence |
|---|---|---|
| ✅ | Specification complete and matching the implementation | `machineApiContract` |
| ✅ | OpenAPI matching routes, schemas and error codes | `machineApiContract` |
| ✅ | Signing vectors reproducible in two languages | `referenceSdks` |
| ✅ | Reference clients that complete a sale against the real server | `referenceSdks` |
| ✅ | Sandbox with a known-good simulator and fault injection | `v1Simulator`, `sandboxFaults` |
| ✅ | Automated certification that tells good from bad | `certificationHarness` |
| ✅ | Every failure scenario A–T answered | `horribleDay` |
| ✅ | Credentials: issue, rotate without downtime, revoke | `machineApiHardening`, horrible-day H |
| ✅ | Rate limits documented and enforced | `machineApiHardening`, spec §4.5 |
| ✅ | A support path for "I paid and got nothing" | `saleTrace` |
| ⚠️ | 5-minute recovery cadence in production | needs the GitHub workflow secrets (§12) |
| ⚠️ | Global (not per-instance) rate limits | needs KV configured |
| ❌ | Tested against a real manufacturer's firmware or API | none exists yet |
| ❌ | Tested on physical hardware (drop sensor, power loss mid-vend) | none |
| ❌ | Automated M-Pesa refunds | refunds are recorded; money is returned by hand |
| ❌ | Settlement rules for conflicts and chargebacks | business decision (§10) |

Verdict for this list: **ready to hand the sandbox, the specification
and the SDKs to a manufacturer to build against. Not ready to take
money on their machines.**

## 14. Remaining blockers

1. **No real manufacturer.** Every integration claim here is proven
   against Snack Quest's simulator and mocks. The first real firmware
   will find things the simulator didn't.
2. **No hardware.** Drop-sensor reliability, power loss mid-vend, motor
   jams and the 2-minute command window are untested on a machine.
3. **Refunds are manual.** `paid_vend_failed` means "refund owed"; staff
   return the money outside the system. The daily ledger check alerts
   when a refund has been owed for over 24 hours, but nothing pays it.
   M-Pesa reversal/B2C with production credentials is required before
   volume.
4. **Production M-Pesa** is not verified end to end for vending (see
   `DARAJA_PRODUCTION_VERIFICATION_AUDIT.md` at the repository root).
5. **Cameras:** no streaming relay, recording, retention policy or
   privacy notice; owners see snapshots only.
6. **Business decisions:** loss allocation for conflicts and
   chargebacks; whether firmware changes on certified models should
   suspend a machine; the idle poll interval versus cost (§7).
7. **Hosting plan:** Vercel Hobby can't run minute-level crons or the
   invocation volume of even a few polling machines.
8. **Key-use anomaly detection** (new source address, unusual outcome
   mix) doesn't exist.
