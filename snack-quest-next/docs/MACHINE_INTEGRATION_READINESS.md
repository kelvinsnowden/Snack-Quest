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

*§5 onward are filled in as the hardening layers land.*
